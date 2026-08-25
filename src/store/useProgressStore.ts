import { create } from "zustand";

import type { lesson, practice_result, user_progress } from "@/features/course/types";
import {
  load_progress,
  record_manual_completion,
  record_result,
  save_progress,
} from "@/features/progress/storage";

interface progress_store {
  progress: user_progress;
  save_practice_result: (result: practice_result, pass_accuracy: number) => void;
  complete_manual_lesson: (lesson_data: lesson, note?: string) => void;
  replace_progress: (progress: user_progress) => void;
}

let on_progress_changed: ((progress: user_progress, result?: practice_result) => void) | undefined;

export function set_progress_sync_handler(
  handler: ((progress: user_progress, result?: practice_result) => void) | undefined,
): void {
  on_progress_changed = handler;
}

export const use_progress_store = create<progress_store>((set) => ({
  progress: load_progress(),
  save_practice_result: (result, pass_accuracy) => {
    set((state) => {
      const progress = record_result(state.progress, result, pass_accuracy);
      save_progress(progress);
      on_progress_changed?.(progress, result);
      return { progress };
    });
  },
  complete_manual_lesson: (lesson_data, note) => {
    set((state) => {
      const progress = record_manual_completion(state.progress, lesson_data, note);
      save_progress(progress);
      const saved_result = progress.results_by_lesson[lesson_data.id]?.at(-1);
      on_progress_changed?.(progress, saved_result);
      return { progress };
    });
  },
  replace_progress: (progress) => {
    save_progress(progress);
    set({ progress });
  },
}));
