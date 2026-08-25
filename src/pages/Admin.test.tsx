import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type {
  DependencyList,
  Dispatch,
  ReactElement,
  ReactNode,
  SetStateAction,
} from "react";

import type { score_draft_record } from "@/features/auth/types";

import { Admin, HymnScoreReviewPanel } from "./Admin";

describe("内容管理后台", () => {
  it("未登录时只显示登录入口", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/后台"]}>
        <Admin user_override={null} />
      </MemoryRouter>,
    );

    expect(markup).toContain("请先登录管理员账号");
    expect(markup).toContain('href="/账号"');
    expect(markup).not.toContain("上传新版本");
  });

  it("管理员可看到上传、版本发布和角色管理", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/后台"]}>
        <Admin
          user_override={{
            id: "admin-1",
            email: "admin@example.com",
            display_name: "管理员",
            role: "admin",
            status: "active",
            created_at: "2026-07-20T00:00:00.000Z",
            updated_at: "2026-07-20T00:00:00.000Z",
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("上传新版本");
    expect(markup).toContain("版本与发布");
    expect(markup).toContain("数据库课程顺序");
    expect(markup).toContain("音符级 ScoreDocument 编辑");
    expect(markup).toContain("用户与角色");
    expect(markup).toContain("旧版本不会被覆盖");
  });

  it("诗歌校对显示并排 SVG、分页、问题状态和完整编辑入口", () => {
    const markup = renderToStaticMarkup(
      <HymnScoreReviewPanel
        draft={create_hymn_draft()}
        on_draft_updated={() => {}}
        on_saved={() => {}}
      />,
    );

    expect(markup).toContain("来源忠实 SVG");
    expect(markup).toContain("规范教学预览");
    expect(markup).toContain("第 1 / 2 张");
    expect(markup).toContain("上一张");
    expect(markup).toContain("下一张");
    expect(markup).toContain("问题清单");
    expect(markup).toContain("未知字形");
    expect(markup).toContain("待处理");
    expect(markup).toContain("审核状态");
    expect(markup).toContain("MIDI 音高");
    expect(markup).toContain("时值");
    expect(markup).toContain("手别");
    expect(markup).toContain("歌词与事件关联");
    expect(markup).toContain("指法");
    expect(markup).toContain("手位区段");
    expect(markup).toContain("和弦");
    expect(markup).toContain("保存全部修订");
    expect(markup).toContain("发布不可变版本");
    expect(markup).toContain("data:image/svg+xml");
  });

  it("点击规范事件时同步事件、来源幻灯片和 shape 定位", () => {
    const renderer = render_with_hooks(HymnScoreReviewPanel, {
      draft: create_hymn_draft(),
      on_draft_updated: () => {},
      on_saved: () => {},
    });

    click_event_button(renderer, "event-1");
    expect_event_source(renderer.tree(), {
      event_id: "event-1",
      note_id: "note-1",
      slide_number: 1,
      shape_id: "shape-1",
    });

    click_event_button(renderer, "event-2");
    expect_event_source(renderer.tree(), {
      event_id: "event-2",
      note_id: "note-2",
      slide_number: 2,
      shape_id: "shape-2",
    });
  });
});

function create_hymn_draft(): score_draft_record {
  const first_source_ref = {
    slide_number: 1,
    shape_id: "shape-1",
    paragraph_index: 0,
    run_index: 0,
  };
  const second_source_ref = {
    slide_number: 2,
    shape_id: "shape-2",
    paragraph_index: 0,
    run_index: 0,
  };
  return {
    id: "draft-1",
    score_id: "hymn-score-001",
    document: {
      schema_version: 2,
      id: "hymn-score-001",
      number: "001",
      title: "奇异恩典",
      key_signature: "C major",
      tonic_midi: 60,
      time_signature: "4/4",
      status: "needs_review",
      provenance: {
        kind: "pptx",
        source_id: "hymn-pptx-001",
        source_file: "001 奇异恩典.pptx",
        source_sha256: "a".repeat(64),
        font_config_version: "simpmusic-font-v1",
        importer_version: "pptx-importer-v1",
        references: [first_source_ref, second_source_ref],
      },
      lyrics: [],
      hand_positions: [],
      measures: [{
        id: "measure-1",
        number: "1",
        meter: { beats: 4, beat_unit: 4 },
        events: [{
          id: "event-1",
          onset_beats: 0,
          duration_beats: 1,
          hand: "right",
          voice: 1,
          notes: [{
            id: "note-1",
            midi: 60,
            source_refs: [first_source_ref],
          }],
          source_refs: [first_source_ref],
        }, {
          id: "event-2",
          onset_beats: 1,
          duration_beats: 1,
          hand: "right",
          voice: 1,
          notes: [{
            id: "note-2",
            midi: 62,
            source_refs: [second_source_ref],
          }],
        }],
      }],
      review: {
        reviewed_by: null,
        reviewed_at: null,
        published_by: null,
        published_at: null,
        note: "等待来源校对",
      },
    },
    hymn_review: {
      review_state: "needs_review",
      font_config_version: "simpmusic-font-v1",
      document_sha256: "b".repeat(64),
      derived_hash: "c".repeat(64),
      slides: [1, 2].map((slide_number) => ({
        slide_number,
        source_svg:
          '<svg xmlns="http://www.w3.org/2000/svg"><text>source</text></svg>',
        normalized_svg:
          '<svg xmlns="http://www.w3.org/2000/svg"><text>normalized</text></svg>',
        source_svg_sha256: "d".repeat(64),
        normalized_svg_sha256: "e".repeat(64),
        source_refs: [slide_number === 1 ? first_source_ref : second_source_ref],
      })),
      issues: [{
        id: "issue-1",
        code: "unknown_glyph",
        kind: "unknown_glyph",
        severity: "error",
        status: "unresolved",
        message: "未知字形待核对",
        source_refs: [first_source_ref],
      }],
    },
    updated_at: "2026-07-24T08:00:00.000Z",
  } as unknown as score_draft_record;
}

type hymn_review_props = Parameters<typeof HymnScoreReviewPanel>[0];
type host_element = ReactElement<Record<string, unknown>, string>;

interface hook_renderer {
  tree: () => ReactElement;
  interact: (interaction: () => void) => void;
}

function render_with_hooks(
  component: (props: hymn_review_props) => ReactElement,
  props: hymn_review_props,
): hook_renderer {
  const state_slots: unknown[] = [];
  const effect_dependencies: Array<DependencyList | undefined> = [];
  let tree: ReactElement;
  let hook_index = 0;
  let state_changed = false;
  let pending_effects: Array<() => void | (() => void)> = [];
  const dispatcher = {
    useState<State>(initial_state: State | (() => State)) {
      const slot = hook_index++;
      if (!(slot in state_slots)) {
        state_slots[slot] = typeof initial_state === "function"
          ? (initial_state as () => State)()
          : initial_state;
      }
      const set_state: Dispatch<SetStateAction<State>> = (update) => {
        const current = state_slots[slot] as State;
        const next = typeof update === "function"
          ? (update as (value: State) => State)(current)
          : update;
        if (!Object.is(current, next)) {
          state_slots[slot] = next;
          state_changed = true;
        }
      };
      return [state_slots[slot] as State, set_state] as const;
    },
    useEffect(
      effect: () => void | (() => void),
      dependencies?: DependencyList,
    ) {
      const slot = hook_index++;
      const previous = effect_dependencies[slot];
      const changed = dependencies === undefined ||
        previous === undefined ||
        dependencies.length !== previous.length ||
        dependencies.some((dependency, index) => !Object.is(dependency, previous[index]));
      effect_dependencies[slot] = dependencies;
      if (changed) {
        pending_effects.push(effect);
      }
    },
  };
  const react_internals = React as unknown as {
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
      ReactCurrentDispatcher: { current: unknown };
    };
  };

  const render = () => {
    do {
      state_changed = false;
      hook_index = 0;
      pending_effects = [];
      const current_dispatcher =
        react_internals.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
          .ReactCurrentDispatcher;
      const previous_dispatcher = current_dispatcher.current;
      current_dispatcher.current = dispatcher;
      try {
        tree = component(props);
      } finally {
        current_dispatcher.current = previous_dispatcher;
      }
      pending_effects.forEach((effect) => effect());
    } while (state_changed);
  };

  render();
  return {
    tree: () => tree,
    interact: (interaction) => {
      interaction();
      render();
    },
  };
}

function click_event_button(renderer: hook_renderer, event_id: string): void {
  const button = get_host_elements(renderer.tree()).find(
    (element) =>
      element.type === "button" &&
      element.props["data-event-id"] === event_id,
  );
  expect(button, `未找到规范事件 ${event_id}`).toBeDefined();
  const on_click = button?.props.onClick;
  expect(on_click).toBeTypeOf("function");
  renderer.interact(() => {
    (on_click as () => void)();
  });
}

function expect_event_source(
  tree: ReactElement,
  expected: {
    event_id: string;
    note_id: string;
    slide_number: number;
    shape_id: string;
  },
): void {
  const elements = get_host_elements(tree);
  const navigation = elements.find(
    (element) => element.props["aria-label"] === "规范教学事件定位",
  );
  expect(navigation).toBeDefined();

  const selected_button = elements.find(
    (element) =>
      element.type === "button" &&
      element.props["data-event-id"] === expected.event_id,
  );
  expect(selected_button?.props["aria-pressed"]).toBe(true);
  const other_event_buttons = elements.filter(
    (element) =>
      element.type === "button" &&
      element.props["data-event-id"] !== undefined &&
      element.props["data-event-id"] !== expected.event_id,
  );
  other_event_buttons.forEach((button) => {
    expect(button.props["aria-pressed"]).toBe(false);
  });
  expect(selected_button?.props["data-source-slide"]).toBe(expected.slide_number);
  expect(selected_button?.props["data-source-shape"]).toBe(expected.shape_id);
  expect(get_text_content(selected_button)).toContain(expected.note_id);

  const source_image = elements.find(
    (element) =>
      element.type === "img" &&
      element.props.alt === `来源第 ${expected.slide_number} 张`,
  );
  expect(source_image?.props.src).toContain("data:image/svg+xml");

  const source_container = elements.find(
    (element) =>
      element.type === "figure" &&
      element.props["data-active-source-shape"] === expected.shape_id,
  );
  expect(source_container?.props["data-active-source-slide"]).toBe(
    expected.slide_number,
  );

  const visible_text = get_text_content(tree);
  expect(visible_text).toContain(`第 ${expected.slide_number} / 2 张`);
  expect(visible_text).toContain(
    `来源定位：第 ${expected.slide_number} 张 · ${expected.shape_id}`,
  );
}

function get_host_elements(node: ReactNode): host_element[] {
  const elements: host_element[] = [];
  const visit = (current: ReactNode) => {
    if (!React.isValidElement<Record<string, unknown>>(current)) {
      return;
    }
    if (typeof current.type === "string") {
      elements.push(current as host_element);
    }
    React.Children.forEach(current.props.children as ReactNode, visit);
  };
  visit(node);
  return elements;
}

function get_text_content(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!React.isValidElement<Record<string, unknown>>(node)) {
    return "";
  }
  return React.Children.toArray(node.props.children as ReactNode)
    .map(get_text_content)
    .join("");
}
