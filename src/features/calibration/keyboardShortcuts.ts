export function duration_beats_from_digit_key(key: string): number | undefined {
  if (key === "1" || key === "2" || key === "3" || key === "4") {
    return Number(key);
  }
  return undefined;
}
