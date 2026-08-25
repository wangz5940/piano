import type { jianpu_meter } from "./model";

export function parse_jianpu_meter(
  time_signature: string,
  fallback_beats = 4,
  fallback_beat_unit = 4,
): jianpu_meter {
  const match = time_signature.match(/(\d+)\s*\/\s*(\d+)/);
  const beats = Number(match?.[1] ?? fallback_beats);
  const beat_unit = Number(match?.[2] ?? fallback_beat_unit);

  return {
    beats: Number.isFinite(beats) && beats > 0 ? beats : fallback_beats,
    beat_unit: Number.isFinite(beat_unit) && beat_unit > 0
      ? beat_unit
      : fallback_beat_unit,
  };
}
