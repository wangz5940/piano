import { describe, expect, it } from "vitest";

import { material_score_sources } from "@/features/assets/catalog";
import type { lesson } from "./types";
import { courses, get_lesson, lessons, practice_days, study_materials } from "./data";

function get_measure_count(lesson_data: lesson): number {
  return Math.max(...lesson_data.score.steps.map((step) => step.measure_index));
}

function get_measure_count_from_title(title: string): number {
  const match = title.match(/(\d+) 小节/);
  if (!match) {
    throw new Error(`标题没有标明小节数：${title}`);
  }
  return Number(match[1]);
}

function step_signature(lesson_data: lesson): string[] {
  return lesson_data.score.steps.map((step) =>
    `${step.measure_index}:${step.beat_in_measure ?? step.beat_index}:${step.hand}:${step.notes.join("-")}`);
}

describe("36 周课程数据", () => {
  it("完整实现 36 周六阶段、108 个练习日和 540 个练习项", () => {
    expect(courses).toHaveLength(6);
    expect(courses.at(-1)?.week_end).toBe(36);
    expect(courses.every((course) => course.available)).toBe(true);
    expect(practice_days).toHaveLength(108);
    expect(lessons).toHaveLength(540);
    for (let week_number = 1; week_number <= 36; week_number += 1) {
      expect(practice_days.filter((day) => day.week_number === week_number)).toHaveLength(3);
    }
  });

  it("按文档使用小汤 1、小汤 2、拜厄，再在第 13 周后只把哈农作为短时辅助", () => {
    const method_lessons = lessons.filter((lesson) => lesson.exercise_type === "method");

    expect(method_lessons.filter((lesson) => lesson.week_number <= 4)
      .every((lesson) => lesson.material_kind === "john-thompson-easiest-1")).toBe(true);
    expect(method_lessons.filter((lesson) => lesson.week_number >= 5 && lesson.week_number <= 8)
      .every((lesson) => lesson.material_kind === "john-thompson-easiest-2")).toBe(true);
    expect(method_lessons.filter((lesson) => lesson.week_number >= 9)
      .every((lesson) => lesson.material_kind === "beyer")).toBe(true);
    expect(lessons.filter((lesson) => lesson.week_number <= 12)
      .some((lesson) => lesson.source_ref?.includes("哈农"))).toBe(false);
    expect(get_lesson("w13-d1-technique")?.source_ref).toContain("哈农仅作 3—5 分钟");
  });

  it("索引四套教材，并把所有候选教材资源保持为待审核", () => {
    expect(study_materials["john-thompson-easiest-1"].page_count).toBe(45);
    expect(study_materials["john-thompson-easiest-2"].page_count).toBe(52);
    expect(study_materials.beyer.page_count).toBe(102);
    expect(study_materials.hanon.page_count).toBe(119);
    expect(Object.values(material_score_sources)
      .every((source) => source.source_status === "needs_review")).toBe(true);
  });

  it("全部练习项都有可阅读谱面或明确的 PPTX OOXML 来源状态", () => {
    expect(lessons.every((lesson) =>
      lesson.score.steps.length > 0 ||
      lesson.score.source.label.includes("PPTX OOXML 来源"))).toBe(true);
    expect(lessons.every((lesson) => lesson.score.time_signature.length > 0)).toBe(true);
    expect(lessons.every((lesson) => lesson.score.start_position.length > 0)).toBe(true);
    expect(lessons.every((lesson) => lesson.score.finger_hint.length > 0)).toBe(true);
    expect(lessons.every((lesson) =>
      lesson.score.finger_guide.preparation.length > 0 &&
      lesson.score.finger_guide.actions.length > 0 &&
      lesson.score.finger_guide.success_checks.length > 0 &&
      lesson.score.finger_guide.common_mistakes.length > 0)).toBe(true);
    expect(lessons.every((lesson) =>
      lesson.score.steps.every((step) =>
        step.fingerings?.length === step.notes.length &&
        step.fingerings.every((fingering) =>
          fingering.finger >= 1 &&
          fingering.finger <= 5 &&
          step.notes.includes(fingering.note))))).toBe(true);
  });

  it("方法教材只走手动核对，不把候选 MusicXML 当成正式判定谱", () => {
    const method_lessons = lessons.filter((lesson) => lesson.exercise_type === "method");

    expect(method_lessons).toHaveLength(108);
    expect(method_lessons.every((lesson) => lesson.practice_mode === "manual_checklist")).toBe(true);
    expect(method_lessons.every((lesson) => lesson.score.source.kind === "reference")).toBe(true);
    expect(method_lessons.every((lesson) => lesson.score.source.status === "needs_review")).toBe(true);
    expect(method_lessons.every((lesson) =>
      lesson.score.source_fingering?.[0].limitation.includes("待审核资源"))).toBe(true);
    expect(method_lessons.some((lesson) => lesson.score.source.kind === "musicxml")).toBe(false);
  });

  it("六个阶段都有可观察的通过标准，结业标准覆盖右手谱、和弦和伴奏", () => {
    expect(courses.every((course) => course.completion_standards.length >= 3)).toBe(true);
    const graduation = courses.at(-1)?.completion_standards.join("");

    expect(graduation).toContain("右手旋律");
    expect(graduation).toContain("和弦");
    expect(graduation).toContain("伴奏");
  });

  it("第 1—8 周曲目保持完整 8—12 小节，并从小汤路线进入双手", () => {
    const foundation_repertoire = lessons.filter((lesson) =>
      lesson.week_number <= 8 && lesson.exercise_type === "repertoire");

    expect(foundation_repertoire).toHaveLength(24);
    expect(foundation_repertoire.every((lesson) => {
      const measure_count = get_measure_count(lesson);
      return measure_count >= 8 && measure_count <= 12;
    })).toBe(true);
    expect(foundation_repertoire.every((lesson) =>
      get_measure_count(lesson) === get_measure_count_from_title(lesson.title))).toBe(true);
    expect(get_lesson("w1-d1-method")?.title).toContain("小汤 1");
    expect(get_lesson("w5-d1-method")?.title).toContain("小汤 2");
    expect(foundation_repertoire.some((lesson) =>
      lesson.score.steps.some((step) => step.hand === "both"))).toBe(true);
  });

  it("第 9—36 周每周三次曲目使用同一份完整谱，不生成互不相干短旋律", () => {
    for (let week_number = 9; week_number <= 36; week_number += 1) {
      const day_1 = get_lesson(`w${week_number}-d1-repertoire`);
      const day_2 = get_lesson(`w${week_number}-d2-repertoire`);
      const day_3 = get_lesson(`w${week_number}-d3-repertoire`);

      if (!day_1 || !day_2 || !day_3) {
        throw new Error(`第 ${week_number} 周曲目缺失`);
      }
      expect(step_signature(day_2)).toEqual(step_signature(day_1));
      expect(step_signature(day_3)).toEqual(step_signature(day_1));
      if (day_3.score.steps.length === 0) {
        expect(day_3.title).toContain("PPTX OOXML 来源核对");
        expect(day_3.practice_mode).toBe("manual_checklist");
        expect(day_3.score.source.status).toBe("needs_review");
      } else {
        expect(get_measure_count(day_3)).toBe(get_measure_count_from_title(day_3.title));
      }
    }
  });

  it("把 12 首诗歌从旧 JPG/手写谱回退改为 PPTX OOXML 待审核来源", () => {
    const hymn_lesson = get_lesson("w9-d1-repertoire");
    if (!hymn_lesson) {
      throw new Error("第 9 周诗歌曲目课缺失");
    }

    expect(hymn_lesson.title).toContain("《耶稣爱我》");
    expect(hymn_lesson.source_ref).toContain("PPTX OOXML 待审核来源");
    expect(hymn_lesson.practice_mode).toBe("manual_checklist");
    expect(hymn_lesson.score.source.kind).toBe("reference");
    expect(hymn_lesson.score.source.status).toBe("needs_review");
    expect(hymn_lesson.score.source.reference_image).toBeUndefined();
    expect(hymn_lesson.score.source.content_sha256).toHaveLength(64);
    expect(hymn_lesson.score.finger_guide.position_map).toHaveLength(0);
    expect(hymn_lesson.score.steps).toHaveLength(0);
    expect(get_lesson("w36-d3-repertoire")?.title).toContain("《至大医生现今可近》");
  });

  it("全部视奏课的标题小节数与真实谱面一致，并覆盖 4、8、16、24、32 小节", () => {
    const sight_lessons = lessons.filter((lesson) => lesson.exercise_type === "sight_reading");
    const measure_counts = new Set(sight_lessons.map(get_measure_count));

    expect(sight_lessons).toHaveLength(108);
    expect(sight_lessons.every((lesson) =>
      get_measure_count(lesson) === get_measure_count_from_title(lesson.title))).toBe(true);
    expect(measure_counts).toEqual(new Set([4, 8, 16, 24, 32]));
    expect(get_measure_count(get_lesson("w36-d3-sight")!)).toBe(32);
  });

  it("后四阶段覆盖常用调、三拍子和 6/8 拍", () => {
    expect(get_lesson("w13-d1-sight")?.score.key_signature).toBe("G 大调（1 = G）");
    expect(get_lesson("w14-d1-sight")?.score.time_signature).toBe("3/4");
    expect(get_lesson("w16-d1-sight")?.score.key_signature).toBe("A 自然小调（1 = A）");
    expect(get_lesson("w18-d1-sight")?.score.time_signature).toBe("6/8");
    expect(get_lesson("w31-d1-repertoire")?.score.time_signature).toBe("3/4");
  });

  it("第 29—36 周曲目和视奏包含持续左手伴奏，不是象征性单个低音", () => {
    const final_two_hand_lessons = lessons.filter((lesson) =>
      lesson.week_number >= 29 &&
      (lesson.exercise_type === "repertoire" || lesson.exercise_type === "sight_reading"));

    expect(final_two_hand_lessons).toHaveLength(48);
    expect(final_two_hand_lessons.every((lesson) => lesson.hand_mode === "both")).toBe(true);
    expect(final_two_hand_lessons.every((lesson) =>
      lesson.score.steps.filter((step) => step.hand === "both").length >=
        get_measure_count(lesson) * 3,
    )).toBe(true);
  });
});
