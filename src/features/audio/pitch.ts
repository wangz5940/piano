const note_names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export interface detected_pitch {
  frequency: number;
  midi_float: number;
  midi: number;
  note_name: string;
  clarity: number;
}

export function midi_to_frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function frequency_to_midi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function midi_to_note_name(midi: number): string {
  const rounded_midi = Math.round(midi);
  return `${note_names[rounded_midi % 12]}${Math.floor(rounded_midi / 12) - 1}`;
}

export function detect_pitch(
  samples: Float32Array,
  sample_rate: number,
): { frequency: number; clarity: number } | undefined {
  const rms = Math.sqrt(
    samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
  );
  if (rms < 0.012) {
    return undefined;
  }

  const min_frequency = 55;
  const max_frequency = 1_200;
  const min_lag = Math.max(2, Math.floor(sample_rate / max_frequency));
  const max_lag = Math.min(
    samples.length - 2,
    Math.floor(sample_rate / min_frequency),
  );
  const correlations = new Float64Array(max_lag + 1);
  let best_lag = -1;
  let best_clarity = 0;

  for (let lag = min_lag; lag <= max_lag; lag += 1) {
    let numerator = 0;
    let left_energy = 0;
    let right_energy = 0;
    for (let index = 0; index < samples.length - lag; index += 1) {
      const left = samples[index];
      const right = samples[index + lag];
      numerator += left * right;
      left_energy += left * left;
      right_energy += right * right;
    }
    const denominator = Math.sqrt(left_energy * right_energy);
    const clarity = denominator === 0 ? 0 : numerator / denominator;
    correlations[lag] = clarity;
    if (clarity > best_clarity) {
      best_clarity = clarity;
      best_lag = lag;
    }
  }

  if (best_lag < 0 || best_clarity < 0.55) {
    return undefined;
  }

  const fundamental_lag = Array.from(
    { length: max_lag - min_lag - 1 },
    (_, index) => min_lag + 1 + index,
  ).find((lag) =>
    correlations[lag] >= best_clarity * 0.96 &&
    correlations[lag] >= correlations[lag - 1] &&
    correlations[lag] >= correlations[lag + 1],
  ) ?? best_lag;
  const fundamental_clarity = correlations[fundamental_lag];
  const previous_clarity = correlations[fundamental_lag - 1];
  const next_clarity = correlations[fundamental_lag + 1];
  const denominator = 2 * (2 * fundamental_clarity - previous_clarity - next_clarity);
  const offset = denominator === 0
    ? 0
    : (next_clarity - previous_clarity) / denominator;
  const refined_lag = fundamental_lag + Math.max(-0.5, Math.min(0.5, offset));

  return {
    frequency: sample_rate / refined_lag,
    clarity: correlations[fundamental_lag],
  };
}
