export interface score_scroll_anchor {
  progress: number;
  viewport_y: number;
}

interface score_rect {
  top: number;
  bottom: number;
  height: number;
}

export function capture_score_scroll_anchor(
  rect: score_rect,
  viewport_height: number,
): score_scroll_anchor | undefined {
  const visible_top = Math.max(rect.top, 0);
  const visible_bottom = Math.min(rect.bottom, viewport_height);
  if (rect.height <= 0 || visible_bottom <= visible_top) return undefined;
  const viewport_y = Math.min(
    visible_bottom,
    Math.max(visible_top, viewport_height / 2),
  );
  return {
    progress: Math.min(1, Math.max(0, (viewport_y - rect.top) / rect.height)),
    viewport_y,
  };
}

export function get_score_scroll_delta(
  rect: Pick<score_rect, "top" | "height">,
  anchor: score_scroll_anchor,
): number {
  return rect.top + rect.height * anchor.progress - anchor.viewport_y;
}
