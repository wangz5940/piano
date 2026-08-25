import { useEffect, useState } from "react";

import { load_active_curriculum } from "./loadCurriculum";
import type { active_curriculum } from "./types";

export function usePublishedCurriculum(): active_curriculum | undefined {
  const [curriculum, set_curriculum] = useState<active_curriculum>();

  useEffect(() => {
    let active = true;
    void load_active_curriculum()
      .then((loaded) => {
        if (active) {
          set_curriculum(loaded);
        }
      })
      .catch(() => {
        if (active) {
          set_curriculum(undefined);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return curriculum;
}
