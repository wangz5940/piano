import { useEffect, useRef } from "react";

import { load_material_practice_events, load_musicxml_text } from "./loadCatalog";
import { inject_musicxml_fingerings } from "./musicxmlFingerings";

export type musicxml_render_state = "loading" | "ready" | "error";

interface musicxml_score_renderer_props {
  musicxml_url?: string;
  musicxml_text?: string;
  practice_events_url?: string;
  show_fingerings?: boolean;
  auto_resize?: boolean;
  draw_measure_numbers?: boolean;
  render_measure_start?: number;
  render_measure_end?: number;
  className?: string;
  on_state_change?: (state: musicxml_render_state) => void;
}

export function MusicXmlScoreRenderer({
  musicxml_url,
  musicxml_text,
  practice_events_url,
  show_fingerings = true,
  auto_resize = true,
  draw_measure_numbers = false,
  render_measure_start,
  render_measure_end,
  className = "musicxml-render-host",
  on_state_change,
}: musicxml_score_renderer_props) {
  const host_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = host_ref.current;
    if (!host) {
      return;
    }

    const render_host = host;
    let cancelled = false;
    let clear_display: (() => void) | undefined;
    render_host.replaceChildren();
    on_state_change?.("loading");

    async function render_score() {
      try {
        const [{ OpenSheetMusicDisplay }, musicxml, practice_data] = await Promise.all([
          import("opensheetmusicdisplay"),
          musicxml_text !== undefined
            ? Promise.resolve(musicxml_text)
            : musicxml_url
              ? load_musicxml_text(musicxml_url)
              : Promise.reject(new Error("missing_musicxml_source")),
          practice_events_url
            ? load_material_practice_events(practice_events_url).catch(() => undefined)
            : Promise.resolve(undefined),
        ]);
        if (cancelled) {
          return;
        }

        const score_xml = show_fingerings
          ? inject_musicxml_fingerings(musicxml, practice_data?.events ?? [])
          : musicxml;
        const display = new OpenSheetMusicDisplay(render_host, {
          autoResize: auto_resize,
          backend: "svg",
          drawPartNames: false,
          drawTitle: false,
          drawMeasureNumbers: draw_measure_numbers,
          drawFromMeasureNumber: render_measure_start,
          drawUpToMeasureNumber: render_measure_end,
          drawFingerings: show_fingerings,
          fingeringPosition: "aboveorbelow",
          fingeringInsideStafflines: false,
        });
        clear_display = () => display.clear();
        await display.load(score_xml);
        if (cancelled) {
          clear_display();
          return;
        }

        display.render();
        on_state_change?.("ready");
      } catch {
        if (!cancelled) {
          on_state_change?.("error");
        }
      }
    }

    void render_score();
    return () => {
      cancelled = true;
      clear_display?.();
      render_host.replaceChildren();
    };
  }, [
    auto_resize,
    draw_measure_numbers,
    musicxml_text,
    musicxml_url,
    on_state_change,
    practice_events_url,
    render_measure_end,
    render_measure_start,
    show_fingerings,
  ]);

  return <div className={className} ref={host_ref} />;
}
