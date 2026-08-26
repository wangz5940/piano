import { useEffect, type RefObject } from "react";

interface centered_active_item_options {
  active_selector?: string;
  behavior?: ScrollBehavior;
}

export function useCenteredActiveItem(
  container_ref: RefObject<HTMLElement>,
  dependency_key: string,
  {
    active_selector = ".is-selected",
    behavior = "smooth",
  }: centered_active_item_options = {},
) {
  useEffect(() => {
    const container = container_ref.current;
    if (!container || typeof window === "undefined") {
      return;
    }

    let frame_id = 0;
    const center_active_item = () => {
      window.cancelAnimationFrame(frame_id);
      frame_id = window.requestAnimationFrame(() => {
        const active_item = container.querySelector<HTMLElement>(active_selector);
        if (!active_item) {
          return;
        }
        const container_rect = container.getBoundingClientRect();
        const item_rect = active_item.getBoundingClientRect();
        const container_center_y = container_rect.top + container_rect.height / 2;
        const item_center_y = item_rect.top + item_rect.height / 2;
        const next_scroll_top = container.scrollTop + item_center_y - container_center_y;
        if (Math.abs(next_scroll_top - container.scrollTop) < 2) {
          return;
        }
        container.scrollTo({
          top: Math.max(0, next_scroll_top),
          behavior,
        });
      });
    };

    center_active_item();
    const resize_observer = new ResizeObserver(center_active_item);
    resize_observer.observe(container);
    const active_item = container.querySelector<HTMLElement>(active_selector);
    if (active_item) {
      resize_observer.observe(active_item);
    }
    window.addEventListener("resize", center_active_item);
    return () => {
      window.cancelAnimationFrame(frame_id);
      resize_observer.disconnect();
      window.removeEventListener("resize", center_active_item);
    };
  }, [active_selector, behavior, container_ref, dependency_key]);
}
