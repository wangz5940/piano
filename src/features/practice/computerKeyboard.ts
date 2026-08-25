const white_key_definitions = [
  { midi: 48, key: "z" },
  { midi: 50, key: "x" },
  { midi: 52, key: "c" },
  { midi: 53, key: "v" },
  { midi: 55, key: "b" },
  { midi: 57, key: "n" },
  { midi: 59, key: "m" },
  { midi: 60, key: "a" },
  { midi: 62, key: "s" },
  { midi: 64, key: "d" },
  { midi: 65, key: "f" },
  { midi: 67, key: "g" },
  { midi: 69, key: "h" },
  { midi: 71, key: "j" },
  { midi: 72, key: "k" },
];

export const computer_keyboard_map = new Map(
  white_key_definitions.map((key) => [key.key, key.midi]),
);
