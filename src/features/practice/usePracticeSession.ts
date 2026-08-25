import { useCallback, useEffect, useMemo, useReducer } from "react";

import type {
  lesson,
  normalized_note_event,
  practice_result,
} from "@/features/course/types";
import { evaluate_input, get_accuracy, get_beat_duration_ms } from "./engine";

type practice_phase = "idle" | "active" | "complete";

interface practice_feedback {
  kind: "hit" | "wrong" | "partial" | "idle";
  message: string;
  timing?: string;
}

export interface practice_state {
  phase: practice_phase;
  current_step_index: number;
  expected_at?: number;
  collected_notes: number[];
  collected_started_at?: number;
  active_notes: number[];
  incorrect_notes: number[];
  pending_hold?: {
    notes: number[];
    required_until: number;
    timing: practice_feedback["timing"];
  };
  correct_steps: number;
  mistakes: number;
  early_steps: number;
  late_steps: number;
  combo: number;
  max_combo: number;
  performance_started_at?: number;
  started_at?: number;
  completed_at?: number;
  feedback: practice_feedback;
}

export type practice_action =
  | { type: "start"; timestamp: number; bpm: number; started_at?: number }
  | { type: "reset" }
  | { type: "note"; event: normalized_note_event; bpm: number };

export const initial_state: practice_state = {
  phase: "idle",
  current_step_index: 0,
  collected_notes: [],
  collected_started_at: undefined,
  active_notes: [],
  incorrect_notes: [],
  pending_hold: undefined,
  correct_steps: 0,
  mistakes: 0,
  early_steps: 0,
  late_steps: 0,
  combo: 0,
  max_combo: 0,
  feedback: {
    kind: "idle",
    message: "点击开始后，先听一拍，再落下第一个音。",
  },
};

export function usePracticeSession(lesson_data: lesson, bpm: number) {
  const [state, dispatch] = useReducer(
    (current_state: practice_state, next_action: practice_action) =>
      reduce_practice_state(current_state, next_action, lesson_data),
    initial_state,
  );
  const session_key = `${lesson_data.id}:${lesson_data.steps?.map((step) => step.id).join("|") ?? ""}`;

  useEffect(() => {
    dispatch({ type: "reset" });
  }, [session_key]);

  const start = useCallback(
    (timestamp: number, started_at = Date.now()) => {
      dispatch({ type: "start", timestamp, started_at, bpm });
    },
    [bpm],
  );

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const receive_note = useCallback(
    (event: normalized_note_event) => {
      dispatch({ type: "note", event, bpm });
    },
    [bpm],
  );

  const result = useMemo<practice_result | undefined>(() => {
    if (state.phase !== "complete" || !state.started_at || !state.completed_at) {
      return undefined;
    }

    return {
      lesson_id: lesson_data.id,
      started_at: state.started_at,
      completed_at: state.completed_at,
      total_steps: lesson_data.steps?.length ?? 0,
      correct_steps: state.correct_steps,
      mistakes: state.mistakes,
      early_steps: state.early_steps,
      late_steps: state.late_steps,
      max_combo: state.max_combo,
      accuracy: get_accuracy(state.correct_steps, state.mistakes),
      completed: true,
    };
  }, [lesson_data.id, lesson_data.steps?.length, state]);

  return {
    state,
    result,
    start,
    reset,
    receive_note,
  };
}

export function reduce_practice_state(
  state: practice_state,
  action_data: practice_action,
  lesson_data: lesson,
): practice_state {
  if (action_data.type === "reset") {
    return initial_state;
  }

  if (action_data.type === "start") {
    return {
      ...initial_state,
      phase: "active",
      performance_started_at: action_data.timestamp,
      started_at: Math.round(action_data.started_at ?? action_data.timestamp),
      expected_at: action_data.timestamp + get_beat_duration_ms(action_data.bpm),
      feedback: {
        kind: "idle",
        message: "准备。听到下一拍后弹奏第一个目标音。",
      },
    };
  }

  if (state.phase !== "active") {
    return state;
  }

  const steps = lesson_data.steps ?? [];
  const current_step = steps[state.current_step_index];
  if (!current_step) {
    return state;
  }

  if (action_data.event.type === "note_off") {
    const active_notes = state.active_notes.filter((note) => note !== action_data.event.note);
    const collected_notes = state.collected_notes.filter((note) => note !== action_data.event.note);
    if (
      state.pending_hold &&
      state.pending_hold.notes.includes(action_data.event.note)
    ) {
      if (action_data.event.timestamp < state.pending_hold.required_until) {
        return {
          ...state,
          active_notes,
          collected_notes: [],
          collected_started_at: undefined,
          pending_hold: undefined,
          incorrect_notes: [action_data.event.note],
          mistakes: state.mistakes + 1,
          combo: 0,
          feedback: {
            kind: "wrong",
            message: `这个音需要保持 ${current_step.duration_beats} 拍，再放松离键。`,
          },
        };
      }

      return complete_step(
        {
          ...state,
          active_notes,
          pending_hold: undefined,
        },
        current_step,
        steps.length,
        action_data.event.timestamp,
        action_data.bpm,
        state.pending_hold.timing,
      );
    }

    return {
      ...state,
      active_notes,
      collected_notes,
      collected_started_at: collected_notes.length > 0
        ? state.collected_started_at
        : undefined,
    };
  }

  if (state.pending_hold) {
    const is_expected_note = state.pending_hold.notes.includes(action_data.event.note);
    return {
      ...state,
      active_notes: Array.from(new Set([...state.active_notes, action_data.event.note])),
      incorrect_notes: is_expected_note ? [] : [action_data.event.note],
      mistakes: state.mistakes + Number(!is_expected_note),
      combo: is_expected_note ? state.combo : 0,
      feedback: is_expected_note
        ? state.feedback
        : {
            kind: "wrong",
            message: "保持长音时不要加入其他音，放松后重新完成这一拍。",
          },
    };
  }

  const evaluation = evaluate_input({
    expected_notes: current_step.notes,
    received_note: action_data.event.note,
    collected_notes: state.collected_notes,
    collected_started_at: state.collected_started_at,
    expected_at: state.expected_at,
    timestamp: action_data.event.timestamp,
  });

  if (evaluation.kind === "wrong") {
    return {
      ...state,
      active_notes: Array.from(new Set([...state.active_notes, action_data.event.note])),
      incorrect_notes: [action_data.event.note],
      collected_notes: [],
      collected_started_at: undefined,
      mistakes: state.mistakes + 1,
      combo: 0,
      feedback: {
        kind: "wrong",
        timing: evaluation.timing,
        message: `这一拍需要 ${current_step.note_names.join(" + ")}，慢一点重试。`,
      },
    };
  }

  if (evaluation.kind === "partial") {
    const is_existing_collection =
      state.collected_started_at !== undefined &&
      action_data.event.timestamp - state.collected_started_at <= 250;
    return {
      ...state,
      active_notes: Array.from(new Set([...state.active_notes, action_data.event.note])),
      incorrect_notes: [],
      collected_notes: evaluation.accepted_notes,
      collected_started_at: is_existing_collection
        ? state.collected_started_at
        : action_data.event.timestamp,
      feedback: {
        kind: "partial",
        timing: evaluation.timing,
        message: `还需要 ${current_step.note_names.filter((note) => !evaluation.accepted_notes.includes(note_to_midi(note))).join(" + ")}。`,
      },
    };
  }

  const active_notes = Array.from(new Set([
    ...state.active_notes,
    ...evaluation.accepted_notes,
  ]));
  if (current_step.duration_beats > 1) {
    const hold_started_at = state.collected_started_at ?? action_data.event.timestamp;
    const hold_tolerance_ms = 250;
    return {
      ...state,
      active_notes,
      incorrect_notes: [],
      collected_notes: [],
      collected_started_at: undefined,
      pending_hold: {
        notes: current_step.notes,
        required_until: hold_started_at +
          current_step.duration_beats * get_beat_duration_ms(action_data.bpm) -
          hold_tolerance_ms,
        timing: evaluation.timing,
      },
      feedback: {
        kind: "partial",
        timing: evaluation.timing,
        message: `音高正确，保持 ${current_step.duration_beats} 拍后再放松离键。`,
      },
    };
  }

  return complete_step(
    { ...state, active_notes },
    current_step,
    steps.length,
    action_data.event.timestamp,
    action_data.bpm,
    evaluation.timing,
  );
}

function complete_step(
  state: practice_state,
  current_step: NonNullable<lesson["steps"]>[number],
  step_count: number,
  timestamp: number,
  bpm: number,
  timing: practice_feedback["timing"],
): practice_state {
  const is_last_step = state.current_step_index === step_count - 1;
  const has_timing_error = timing === "稍早" || timing === "稍晚";
  const next_combo = has_timing_error ? 0 : state.combo + 1;
  const completed_at = is_last_step
    ? Math.round(
      (state.started_at ?? timestamp) +
        Math.max(0, timestamp - (state.performance_started_at ?? timestamp)),
    )
    : undefined;
  const timing_message =
    timing === "稳定" || timing === "起拍"
      ? "很好，保持均匀的呼吸。"
      : timing === "稍早"
        ? "音对了，下一拍先等一等。"
        : "音对了，下一拍更早准备。";

  return {
    ...state,
    phase: is_last_step ? "complete" : "active",
    current_step_index: is_last_step ? state.current_step_index : state.current_step_index + 1,
    expected_at: is_last_step
      ? undefined
      : (state.expected_at ?? timestamp) +
        current_step.duration_beats * get_beat_duration_ms(bpm),
    collected_notes: [],
    collected_started_at: undefined,
    pending_hold: undefined,
    incorrect_notes: [],
    correct_steps: state.correct_steps + 1,
    mistakes: state.mistakes + Number(has_timing_error),
    early_steps: state.early_steps + Number(timing === "稍早"),
    late_steps: state.late_steps + Number(timing === "稍晚"),
    combo: next_combo,
    max_combo: Math.max(state.max_combo, next_combo),
    completed_at,
    feedback: {
      kind: "hit",
      timing,
      message: is_last_step ? "这一句完成了。" : timing_message,
    },
  };
}

function note_to_midi(note_name: string): number {
  const base_notes: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const match = note_name.match(/^([A-G])([♯#]?)(-?\d+)$/);
  if (!match) {
    return -1;
  }

  const [, base, accidental, octave] = match;
  return (Number(octave) + 1) * 12 + base_notes[base] + (accidental ? 1 : 0);
}
