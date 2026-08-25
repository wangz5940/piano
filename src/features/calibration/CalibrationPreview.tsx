import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  MusicXmlScoreRenderer,
  type musicxml_render_state,
} from "@/features/assets/MusicXmlScoreRenderer";
import { score_document_to_musicxml } from "@/features/assets/scoreDocumentMusicXml";
import {
  JianpuRenderer,
  to_render_score_from_score_document,
} from "@/features/jianpu/render";
import type { score_document } from "@/features/score";

import { parse_score_document_json } from "./scoreDocumentJson";
import type { calibration_event_metadata } from "./types";

export type calibration_preview_mode = "staff" | "jianpu" | "data";

export function CalibrationPreview({
  document,
  event_metadata = {},
  mode,
  selected_event_id,
  on_event_select,
  on_document_replace,
  on_data_json_error_change,
  width,
}: {
  document: score_document;
  event_metadata?: Readonly<Record<string, calibration_event_metadata>>;
  mode: calibration_preview_mode;
  selected_measure_id?: string;
  selected_event_id?: string;
  on_event_select?: (event_id: string) => void;
  on_document_replace?: (document: score_document) => void;
  on_data_json_error_change?: (error?: string) => void;
  width?: number;
}) {
  const render_score = to_render_score_from_score_document(
    document,
    event_metadata,
  );
  const musicxml_text = useMemo(
    () => score_document_to_musicxml(document, event_metadata),
    [document, event_metadata],
  );
  if (mode === "staff") {
    return (
      <CalibrationStaffPreview
        musicxml_text={musicxml_text}
        selected_event_id={selected_event_id}
        interactive={Boolean(on_event_select)}
      />
    );
  }
  if (mode === "data") {
    return (
      <ScoreDocumentJsonEditor
        document={document}
        on_document_replace={on_document_replace}
        on_error_change={on_data_json_error_change}
      />
    );
  }
  return (
    <JianpuRenderer
      score={render_score}
      mode="reading"
      current_event_id={selected_event_id}
      on_event_select={on_event_select}
      show_fingerings
      width={width}
      className="calibration-jianpu-preview"
    />
  );
}

function CalibrationStaffPreview({
  musicxml_text,
  selected_event_id,
  interactive,
}: {
  musicxml_text: string;
  selected_event_id?: string;
  interactive: boolean;
}) {
  const [render_state, set_render_state] = useState<musicxml_render_state>("loading");
  return (
    <section
      className="calibration-standard-staff-preview"
      data-standard-staff-renderer="osmd"
      data-current-event-id={selected_event_id}
      data-interactive-source={interactive ? "event-list" : undefined}
    >
      {render_state === "loading" && (
        <p className="calibration-staff-render-state">正在渲染五线谱…</p>
      )}
      {render_state === "error" && (
        <p className="calibration-staff-render-state is-error">
          五线谱暂时未能显示。
        </p>
      )}
      <MusicXmlScoreRenderer
        musicxml_text={musicxml_text}
        show_fingerings
        draw_measure_numbers
        className="calibration-standard-staff-host"
        on_state_change={set_render_state}
      />
    </section>
  );
}

function ScoreDocumentJsonEditor({
  document,
  on_document_replace,
  on_error_change,
}: {
  document: score_document;
  on_document_replace?: (document: score_document) => void;
  on_error_change?: (error?: string) => void;
}) {
  const [draft, set_draft] = useState(() => JSON.stringify(document, null, 2));
  const [parse_error, set_parse_error] = useState<string>();
  const [is_dirty, set_is_dirty] = useState(false);

  useEffect(() => {
    set_draft(JSON.stringify(document, null, 2));
    set_parse_error(undefined);
    set_is_dirty(false);
    on_error_change?.(undefined);
  }, [document, on_error_change]);

  const update_state = (next_parse_error?: string, next_dirty = is_dirty) => {
    set_parse_error(next_parse_error);
    on_error_change?.(
      next_parse_error ??
        (next_dirty ? "JSON 已修改但尚未应用，保存前请先应用。" : undefined),
    );
  };

  const handle_change = (value: string) => {
    set_draft(value);
    set_is_dirty(true);
    try {
      parse_score_document_json(value);
      update_state(undefined, true);
    } catch (parse_error) {
      update_state(
        parse_error instanceof Error
          ? parse_error.message
          : "JSON 格式无效。",
        true,
      );
    }
  };

  const apply_json = () => {
    try {
      const next_document = parse_score_document_json(draft);
      set_parse_error(undefined);
      set_is_dirty(false);
      on_error_change?.(undefined);
      on_document_replace?.(next_document);
    } catch (parse_error) {
      update_state(
        parse_error instanceof Error
          ? parse_error.message
          : "JSON 格式无效。",
        true,
      );
    }
  };
  const message = parse_error ??
    (is_dirty ? "JSON 已修改但尚未应用，保存前请先应用。" : undefined);

  return (
    <section
      className="calibration-data-editor"
      data-json-state={parse_error ? "invalid" : is_dirty ? "dirty" : "clean"}
    >
      <header>
        <strong>ScoreDocument JSON</strong>
        <button
          type="button"
          disabled={!on_document_replace || Boolean(parse_error) || !is_dirty}
          onClick={apply_json}
        >
          应用 JSON
        </button>
      </header>
      {message && <p role="alert">{message}</p>}
      <textarea
        spellCheck={false}
        value={draft}
        aria-label="ScoreDocument JSON"
        onChange={(event) => handle_change(event.target.value)}
      />
    </section>
  );
}
