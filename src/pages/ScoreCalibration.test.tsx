import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { create_calibration_project } from "@/features/calibration/storage";
import type { calibration_project } from "@/features/calibration/types";
import { duration_beats_from_digit_key } from "@/features/calibration/keyboardShortcuts";

import { ScoreCalibration } from "./ScoreCalibration";

const admin = {
  id: "admin-calibration",
  email: "calibration@example.com",
  display_name: "校准员",
  role: "admin" as const,
  status: "active" as const,
  created_at: "2026-08-24T00:00:00.000Z",
  updated_at: "2026-08-24T00:00:00.000Z",
};

describe("通用乐谱校准台", () => {
  it("未登录时不暴露校准工作区", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ScoreCalibration user_override={null} />
      </MemoryRouter>,
    );

    expect(markup).toContain("请先登录管理员账号");
    expect(markup).not.toContain("导出 Golden Score");
  });

  it("提供已有内容选择、分层校验、事件编辑和三种预览", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ScoreCalibration
          user_override={admin}
          initial_projects={[create_project_fixture()]}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("从原件证据到 Golden Score");
    expect(markup).toContain("已有乐谱");
    expect(markup).toContain("校准对象来自教材谱库");
    expect(markup).toContain("《拜厄》标题特殊处理：共 98 条");
    expect(markup).toContain("原谱第 22 页：第 12-15 条");
    expect(markup).toContain("折叠教材片段");
    expect(markup).toContain("折叠已有内容");
    expect(markup).not.toContain("附加原始资料");
    expect(markup).not.toContain("导入 MusicXML");
    expect(markup).not.toContain("导入 Score JSON");
    expect(markup).toContain("L0");
    expect(markup).toContain("L1");
    expect(markup).toContain("L2");
    expect(markup).toContain("L3");
    expect(markup).toContain("已有内容");
    expect(markup).toContain("数字乐谱");
    expect(markup).toContain("缩放");
    expect(markup).toContain("适屏");
    expect(markup).toContain("分屏");
    expect(markup).toContain("底部");
    expect(markup).toContain("五线谱");
    expect(markup).toContain("简谱");
    expect(markup).toContain("数据");
    expect(markup).toContain("自动校验");
    expect(markup).not.toContain("教材章节名");
    expect(markup).toContain("主要校准项");
    expect(markup).toContain("其他校准项");
    expect(markup).toContain('title="调整字段布局"');
    expect(markup).toContain("MIDI 音高");
    expect(markup).toContain("音名 / 八度");
    expect(markup).toContain("节拍位置");
    expect(markup).toContain("和弦");
    expect(markup).toContain("休止符");
    expect(markup).toContain("临时记号");
    expect(markup).toContain("速度记号");
    expect(markup).toContain("反复记号");
    expect(markup).toContain("声部");
    expect(markup).toContain("谱表");
    expect(markup).toContain("谱号");
    expect(markup).toContain("手别");
    expect(markup).toContain("Tie");
    expect(markup).toContain("Slur");
    expect(markup).toContain("奏法");
    expect(markup).toContain("力度");
    expect(markup).toContain("指法");
    expect(markup).toContain("原件页数");
    expect(markup).toContain("主音 MIDI");
    expect(markup).toContain('title="新增小节"');
    expect(markup).toContain('title="新增事件"');
    expect(markup).toContain('title="新增音符"');
    expect(markup).toContain("导出 Golden Score");
    const primary_fields = [
      'data-calibration-field="pitch_name"',
      'data-calibration-field="duration"',
      'data-calibration-field="fingering"',
      'data-calibration-field="hand"',
    ];
    const field_offsets = primary_fields.map((field) => markup.indexOf(field));
    expect(field_offsets.every((offset, index) =>
      offset >= 0 && (index === 0 || offset > field_offsets[index - 1])))
      .toBe(true);
    expect(markup.indexOf("<strong>主要校准项</strong>"))
      .toBeLessThan(markup.indexOf("<span>事件</span>"));
    expect(markup.indexOf("<strong>主要校准项</strong>"))
      .toBeLessThan(markup.indexOf("<span>音符</span>"));
    expect(markup.indexOf("主要校准项")).toBeLessThan(markup.indexOf("小节号"));
  });

  it("支持数字键 1-4 映射为对应拍数", () => {
    expect(duration_beats_from_digit_key("1")).toBe(1);
    expect(duration_beats_from_digit_key("2")).toBe(2);
    expect(duration_beats_from_digit_key("3")).toBe(3);
    expect(duration_beats_from_digit_key("4")).toBe(4);
    expect(duration_beats_from_digit_key("5")).toBeUndefined();
    expect(duration_beats_from_digit_key("ArrowRight")).toBeUndefined();
  });
});

function create_project_fixture(): calibration_project {
  const project = create_calibration_project({
    composer: "Ferdinand Beyer",
    opus: "Op.101",
    edition: "Test edition",
    publisher: "Test",
    source: "Scan",
  });
  project.title = "拜厄校准样本";
  project.id = "material:beyer:beyer.segment.012";
  project.source.file_name = "beyer-page-1.png";
  project.material_catalog = {
    material_id: "beyer",
    title: "拜厄钢琴基本教程",
    chapters: [{
      id: "intro",
      title: "入门章节",
      description: "",
      page_start: 1,
      page_end: 21,
    }, {
      id: "duet",
      title: "双手章节",
      description: "",
      page_start: 22,
      page_end: 46,
    }],
  };
  project.document.title = project.title;
  project.document.measures = [{
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
        source_refs: [],
      }],
      source_refs: [],
    }],
  }];
  project.event_metadata["event-1"] = {
    event_id: "event-1",
    staff: 1,
    hand: "right",
    clef: "treble",
    articulation: "",
    dynamics: "",
    slur: "none",
    source_page: 22,
    source_system: 1,
  };
  return project;
}
