import { useCallback, useEffect, useRef, useState } from "react";

export function usePracticeAudio(beat_duration_ms: number) {
  const context_ref = useRef<AudioContext | null>(null);
  const interval_ref = useRef<number | null>(null);
  const [metronome_enabled, set_metronome_enabled] = useState(false);

  const get_context = useCallback(() => {
    if (!context_ref.current) {
      context_ref.current = new AudioContext();
    }

    if (context_ref.current.state === "suspended") {
      void context_ref.current.resume();
    }

    return context_ref.current;
  }, []);

  const play_tone = useCallback(
    (frequency: number, duration = 0.08, volume = 0.05) => {
      const context = get_context();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    },
    [get_context],
  );

  const play_feedback = useCallback(
    (kind: "hit" | "wrong" | "partial") => {
      if (kind === "hit") {
        play_tone(880, 0.09, 0.055);
      } else if (kind === "partial") {
        play_tone(660, 0.06, 0.035);
      } else {
        play_tone(180, 0.1, 0.04);
      }
    },
    [play_tone],
  );

  useEffect(() => {
    if (!metronome_enabled) {
      if (interval_ref.current !== null) {
        window.clearInterval(interval_ref.current);
        interval_ref.current = null;
      }
      return;
    }

    play_tone(740, 0.05, 0.04);
    interval_ref.current = window.setInterval(() => {
      play_tone(740, 0.05, 0.04);
    }, beat_duration_ms);

    return () => {
      if (interval_ref.current !== null) {
        window.clearInterval(interval_ref.current);
        interval_ref.current = null;
      }
    };
  }, [beat_duration_ms, metronome_enabled, play_tone]);

  return {
    metronome_enabled,
    set_metronome_enabled,
    play_feedback,
    play_click: () => play_tone(740, 0.05, 0.04),
  };
}
