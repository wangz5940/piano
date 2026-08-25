import type { score_document_measure } from "@/features/score";

export async function play_calibration_measure(
  measure: score_document_measure,
  bpm = 84,
): Promise<() => void> {
  const AudioContextConstructor = window.AudioContext ??
    (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("当前浏览器不支持 Web Audio。");
  }
  const context = new AudioContextConstructor();
  await context.resume();
  const seconds_per_beat = 60 / bpm;
  const start_at = context.currentTime + 0.05;
  const oscillators: OscillatorNode[] = [];

  for (const event of measure.events) {
    for (const note of event.notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const note_start = start_at + event.onset_beats * seconds_per_beat;
      const note_end = note_start +
        Math.max(0.08, event.duration_beats * seconds_per_beat);
      oscillator.type = event.hand === "right" ? "triangle" : "sine";
      oscillator.frequency.value = midi_to_frequency(note.midi);
      gain.gain.setValueAtTime(0.0001, note_start);
      gain.gain.exponentialRampToValueAtTime(
        event.hand === "right" ? 0.12 : 0.09,
        note_start + 0.018,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, note_end);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(note_start);
      oscillator.stop(note_end + 0.03);
      oscillators.push(oscillator);
    }
  }

  const total_seconds = measure.meter.beats * seconds_per_beat + 0.2;
  window.setTimeout(() => {
    void context.close().catch(() => undefined);
  }, total_seconds * 1000);

  return () => {
    oscillators.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {
        // Already stopped.
      }
    });
    void context.close().catch(() => undefined);
  };
}

function midi_to_frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
