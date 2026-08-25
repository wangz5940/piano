export function parse_time_signature(
  time_signature: string,
  fallback_beats: number,
): [number, number] {
  const primary_signature = time_signature.split(/[、,]/)[0]?.trim();
  const match = primary_signature?.match(/^(\d+)\/(\d+)$/);
  return match
    ? [Number(match[1]), Number(match[2])]
    : [fallback_beats, 4];
}
