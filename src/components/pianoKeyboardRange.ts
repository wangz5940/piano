const note_names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const white_semitones = new Set([0, 2, 4, 5, 7, 9, 11]);

const computer_keys: Record<number, string> = {
  48: "z", 50: "x", 52: "c", 53: "v", 55: "b", 57: "n", 59: "m",
  60: "a", 62: "s", 64: "d", 65: "f", 67: "g", 69: "h", 71: "j", 72: "k",
};

export function get_keyboard_range(notes: number[]) {
  const playable_notes = notes.filter((note) => Number.isFinite(note));
  const target_min = playable_notes.length > 0 ? Math.min(...playable_notes) : 48;
  const target_max = playable_notes.length > 0 ? Math.max(...playable_notes) : 72;
  const start = Math.max(24, Math.floor(Math.min(target_min, 48) / 12) * 12);
  const end = Math.min(108, Math.ceil(Math.max(target_max, 72) / 12) * 12);
  const white_keys = Array.from({ length: end - start + 1 }, (_, index) => start + index)
    .filter((midi) => white_semitones.has(midi % 12))
    .map((midi) => ({
      midi,
      note: midi_to_name(midi),
      key: computer_keys[midi],
    }));
  const black_keys = Array.from({ length: end - start + 1 }, (_, index) => start + index)
    .filter((midi) => !white_semitones.has(midi % 12))
    .map((midi) => ({
      midi,
      note: midi_to_name(midi),
      white_index: white_keys.findIndex((key) => key.midi === midi - 1),
    }))
    .filter((key) => key.white_index >= 0);

  return { white_keys, black_keys };
}

function midi_to_name(midi: number): string {
  return `${note_names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
