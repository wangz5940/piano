import type { expected_step } from "@/features/course/types";
import { format_step_fingerings } from "@/features/course/fingerings";

interface notation_strip_props {
  steps: expected_step[];
  current_index: number;
}

export function NotationStrip({ steps, current_index }: notation_strip_props) {
  return (
    <div className="notation-strip" aria-label="当前练习简谱">
      {steps.map((step, index) => {
        const is_current = index === current_index;
        const is_done = index < current_index;

        return (
          <div
            key={step.id}
            className={`notation-note ${is_current ? "is-current" : ""} ${is_done ? "is-done" : ""}`}
            aria-current={is_current ? "step" : undefined}
          >
            <span className="notation-hand">{get_hand_label(step.hand)}</span>
            <strong>{step.notation}</strong>
            <em>{format_step_fingerings(step)}</em>
            <small>{step.note_names.join(" + ")}</small>
          </div>
        );
      })}
    </div>
  );
}

function get_hand_label(hand: expected_step["hand"]): string {
  if (hand === "left") {
    return "左";
  }

  if (hand === "both") {
    return "双";
  }

  return "右";
}
