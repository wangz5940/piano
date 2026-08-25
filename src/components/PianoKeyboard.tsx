import { get_keyboard_range } from "./pianoKeyboardRange";

interface piano_keyboard_props {
  active_notes: number[];
  target_notes: number[];
  range_notes?: number[];
  incorrect_notes: number[];
  on_note_on: (note: number) => void;
  on_note_off: (note: number) => void;
}

export function PianoKeyboard({
  active_notes,
  target_notes,
  range_notes,
  incorrect_notes,
  on_note_on,
  on_note_off,
}: piano_keyboard_props) {
  const { white_keys, black_keys } = get_keyboard_range(
    range_notes && range_notes.length > 0
      ? range_notes
      : [...target_notes, ...active_notes],
  );
  const get_key_class_name = (midi: number, base: string) =>
    [
      base,
      target_notes.includes(midi) ? "is-target" : "",
      active_notes.includes(midi) ? "is-pressed" : "",
      incorrect_notes.includes(midi) ? "is-incorrect" : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div className="piano-frame">
      <div
        className="piano-keyboard"
        style={{ width: `${Math.max(690, white_keys.length * 47)}px` }}
        role="group"
        aria-label="虚拟钢琴键盘"
      >
        <div className="white-keys">
          {white_keys.map((key) => (
            <button
              key={key.midi}
              type="button"
              className={get_key_class_name(key.midi, "piano-key white-key")}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                on_note_on(key.midi);
              }}
              onPointerUp={() => on_note_off(key.midi)}
              onPointerCancel={() => on_note_off(key.midi)}
              aria-label={`弹奏 ${key.note}`}
            >
              <span>{get_solfege(key.midi)}</span>
              <small>{key.note}</small>
              {key.key && <kbd>{key.key.toUpperCase()}</kbd>}
            </button>
          ))}
        </div>
        <div className="black-keys" aria-hidden="true">
          {black_keys.map((key) => (
            <button
              key={key.midi}
              type="button"
              className={get_key_class_name(key.midi, "piano-key black-key")}
              style={{ left: `${(key.white_index + 0.73) * (100 / white_keys.length)}%` }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                on_note_on(key.midi);
              }}
              onPointerUp={() => on_note_off(key.midi)}
              onPointerCancel={() => on_note_off(key.midi)}
              tabIndex={-1}
            >
              <small>{key.note}</small>
            </button>
          ))}
        </div>
      </div>
      <p className="piano-legend">
        <span className="legend-target" /> 目标音
        <span className="legend-pressed" /> 刚刚按下
        <span className="legend-wrong" /> 需要重试
      </p>
    </div>
  );
}

function get_solfege(midi: number): string {
  const degrees: Record<number, string> = {
    0: "1", 2: "2", 4: "3", 5: "4", 7: "5", 9: "6", 11: "7",
  };
  return degrees[midi % 12] ?? "";
}
