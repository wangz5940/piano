import { useCallback, useEffect, useRef, useState } from "react";

import type { normalized_note_event } from "@/features/course/types";
import {
  detect_pitch,
  frequency_to_midi,
  midi_to_frequency,
  midi_to_note_name,
} from "./pitch";

export type audio_input_status =
  | "idle"
  | "requesting"
  | "connected"
  | "insecure"
  | "unavailable"
  | "denied"
  | "error";

export interface audio_calibration {
  midi: number;
  frequency: number;
  tuning_offset_cents: number;
}

export interface audio_pitch_state {
  frequency: number;
  midi: number;
  note_name: string;
  clarity: number;
}

interface audio_pitch_input_options {
  tuning_offset_cents?: number;
  on_calibration?: (calibration: audio_calibration) => void;
}

interface audio_context_window extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export function useAudioPitchInput(
  on_note: ((event: normalized_note_event) => void) | undefined,
  {
    tuning_offset_cents = 0,
    on_calibration,
  }: audio_pitch_input_options = {},
) {
  const on_note_ref = useRef(on_note);
  const on_calibration_ref = useRef(on_calibration);
  const audio_context_ref = useRef<AudioContext>();
  const stream_ref = useRef<MediaStream>();
  const analyser_ref = useRef<AnalyserNode>();
  const source_ref = useRef<MediaStreamAudioSourceNode>();
  const frame_ref = useRef<number>();
  const samples_ref = useRef<Float32Array>();
  const current_note_ref = useRef<number>();
  const last_pitch_at_ref = useRef(0);
  const calibration_ref = useRef<{ midi: number; started_at?: number }>();
  const status_ref = useRef<audio_input_status>("idle");
  const connecting_ref = useRef(false);
  const [status, set_status] = useState<audio_input_status>("idle");
  const [current_pitch, set_current_pitch] = useState<audio_pitch_state>();
  const [calibration_target_midi, set_calibration_target_midi] = useState<number>();
  status_ref.current = status;

  useEffect(() => {
    on_note_ref.current = on_note;
  }, [on_note]);

  useEffect(() => {
    on_calibration_ref.current = on_calibration;
  }, [on_calibration]);

  const emit_note = useCallback((type: normalized_note_event["type"], note: number) => {
    on_note_ref.current?.({
      type,
      note,
      velocity: type === "note_on" ? 96 : 0,
      timestamp: performance.now(),
      source: "microphone",
    });
  }, []);

  const stop_tracking = useCallback(() => {
    if (frame_ref.current !== undefined) {
      cancelAnimationFrame(frame_ref.current);
      frame_ref.current = undefined;
    }
    if (current_note_ref.current !== undefined) {
      emit_note("note_off", current_note_ref.current);
      current_note_ref.current = undefined;
    }
    source_ref.current?.disconnect();
    source_ref.current = undefined;
    analyser_ref.current?.disconnect();
    analyser_ref.current = undefined;
    stream_ref.current?.getTracks().forEach((track) => track.stop());
    stream_ref.current = undefined;
    const audio_context = audio_context_ref.current;
    audio_context_ref.current = undefined;
    if (audio_context && audio_context.state !== "closed") {
      void audio_context.close();
    }
    samples_ref.current = undefined;
    calibration_ref.current = undefined;
    set_calibration_target_midi(undefined);
    set_current_pitch(undefined);
  }, [emit_note]);

  const disconnect = useCallback(() => {
    stop_tracking();
    set_status("idle");
  }, [stop_tracking]);

  const start_tracking = useCallback(() => {
    const analyser = analyser_ref.current;
    const samples = samples_ref.current;
    const audio_context = audio_context_ref.current;
    if (!analyser || !samples || !audio_context) {
      return;
    }

    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      const detected = detect_pitch(samples, audio_context.sampleRate);
      const now = performance.now();

      if (detected) {
        last_pitch_at_ref.current = now;
        const raw_midi_float = frequency_to_midi(detected.frequency);
        const corrected_midi_float = raw_midi_float - tuning_offset_cents / 100;
        const midi = Math.round(corrected_midi_float);
        set_current_pitch({
          frequency: detected.frequency,
          midi,
          note_name: midi_to_note_name(midi),
          clarity: detected.clarity,
        });

        if (current_note_ref.current !== midi) {
          if (current_note_ref.current !== undefined) {
            emit_note("note_off", current_note_ref.current);
          }
          current_note_ref.current = midi;
          emit_note("note_on", midi);
        }

        const calibration = calibration_ref.current;
        if (calibration) {
          const raw_midi = Math.round(raw_midi_float);
          if (raw_midi === calibration.midi) {
            calibration.started_at ??= now;
            if (now - calibration.started_at >= 700) {
              on_calibration_ref.current?.({
                midi: calibration.midi,
                frequency: detected.frequency,
                tuning_offset_cents: (raw_midi_float - calibration.midi) * 100,
              });
              calibration_ref.current = undefined;
              set_calibration_target_midi(undefined);
            }
          } else {
            calibration.started_at = undefined;
          }
        }
      } else if (
        current_note_ref.current !== undefined &&
        now - last_pitch_at_ref.current > 160
      ) {
        emit_note("note_off", current_note_ref.current);
        current_note_ref.current = undefined;
        set_current_pitch(undefined);
      }

      frame_ref.current = requestAnimationFrame(tick);
    };

    frame_ref.current = requestAnimationFrame(tick);
  }, [emit_note, tuning_offset_cents]);

  const connect = useCallback(async () => {
    if (status_ref.current === "connected") {
      return true;
    }
    if (connecting_ref.current) {
      return false;
    }
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      set_status("unavailable");
      return false;
    }
    if (!window.isSecureContext) {
      set_status("insecure");
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      set_status("unavailable");
      return false;
    }

    const AudioContextConstructor =
      window.AudioContext ?? (window as audio_context_window).webkitAudioContext;
    if (!AudioContextConstructor) {
      set_status("unavailable");
      return false;
    }

    set_status("requesting");
    connecting_ref.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const audio_context = new AudioContextConstructor();
      await audio_context.resume();
      const analyser = audio_context.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.05;
      const source = audio_context.createMediaStreamSource(stream);
      source.connect(analyser);

      stream_ref.current = stream;
      audio_context_ref.current = audio_context;
      analyser_ref.current = analyser;
      source_ref.current = source;
      samples_ref.current = new Float32Array(analyser.fftSize);
      set_status("connected");
      start_tracking();
      return true;
    } catch {
      set_status("denied");
      return false;
    } finally {
      connecting_ref.current = false;
    }
  }, [start_tracking]);

  const begin_calibration = useCallback((midi: number) => {
    calibration_ref.current = { midi };
    set_calibration_target_midi(midi);
  }, []);

  useEffect(() => () => stop_tracking(), [stop_tracking]);

  return {
    status,
    current_pitch,
    calibration_target_midi,
    connect,
    disconnect,
    begin_calibration,
    target_frequency: calibration_target_midi === undefined
      ? undefined
      : midi_to_frequency(calibration_target_midi),
  };
}
