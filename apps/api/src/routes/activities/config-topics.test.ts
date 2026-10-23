import { describe, expect, it } from "vitest";
import {
  toStudentTopicView,
  toTeacherTopicView,
  validateEligibility,
  validateTopicCreate,
  validateTopicFields,
  type TopicRow,
} from "./config-topics.js";

const baseRow: TopicRow = {
  id: "topic-1",
  activity_id: "act-1",
  title: "基于 React 的选题系统",
  description: "做一个选题系统",
  tags: ["前端", "React"],
  capacity: 3,
  eligibility_mode: "ALL",
  eligibility_description: "无",
  created_at: new Date("2026-10-20T00:00:00Z"),
  preference_count: 2,
};

describe("validateTopicFields", () => {
  it("接受合法字段并 trim 标题", () => {
    const { fieldErrors, values } = validateTopicFields({
      title: "  题目 A  ",
      capacity: 2,
      tags: ["x"],
      description: "d",
      eligibilityDescription: "",
    });
    expect(fieldErrors).toEqual([]);
    expect(values.title).toBe("题目 A");
    expect(values.capacity).toBe(2);
  });

  it("标题为空报 REQUIRED", () => {
    const { fieldErrors } = validateTopicFields({ title: "   " });
    expect(fieldErrors[0]).toMatchObject({ field: "title", code: "REQUIRED" });
  });

  it("标题超长报 TOO_LONG", () => {
    const { fieldErrors } = validateTopicFields({ title: "x".repeat(201) });
    expect(fieldErrors[0].code).toBe("TOO_LONG");
  });

  it("名额必须是正整数", () => {
    for (const capacity of [0, -1, 1.5, Number.NaN]) {
      const { fieldErrors } = validateTopicFields({ capacity });
      expect(fieldErrors[0]).toMatchObject({ field: "capacity", code: "OUT_OF_RANGE" });
    }
  });

  it("名额上限 1000", () => {
    expect(validateTopicFields({ capacity: 1001 }).fieldErrors[0].code).toBe("OUT_OF_RANGE");
    expect(validateTopicFields({ capacity: 1000 }).fieldErrors).toEqual([]);
  });

  it("标签去重、去空、超长报错", () => {
    const ok = validateTopicFields({ tags: ["a", "a", " ", "b"] });
    expect(ok.values.tags).toEqual(["a", "b"]);

    const tooLong = validateTopicFields({ tags: ["x".repeat(25)] });
    expect(tooLong.fieldErrors[0]).toMatchObject({ field: "tags", code: "TOO_LONG" });
  });

  it("标签数量上限 8", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `t${i}`);
    expect(validateTopicFields({ tags: nine }).fieldErrors[0].code).toBe("TOO_MANY");
    expect(validateTopicFields({ tags: nine.slice(0, 8) }).fieldErrors).toEqual([]);
  });

  it("未提供的字段不出现在结果里（用于 PATCH 只改指定字段）", () => {
    const { values } = validateTopicFields({ capacity: 5 });
    expect(Object.keys(values)).toEqual(["capacity"]);
  });
});

describe("validateEligibility", () => {
  it("ALL 不带名单", () => {
    expect(validateEligibility({ eligibilityMode: "ALL" })).toMatchObject({
      fieldErrors: [],
      mode: "ALL",
      ids: [],
    });
  });

  it("ALL 带非空名单报错", () => {
    const r = validateEligibility({
      eligibilityMode: "ALL",
      eligibleParticipantIds: ["p1"],
    });
    expect(r.fieldErrors[0].field).toBe("eligibleParticipantIds");
  });

  it("EXPLICIT 必须给名单", () => {
    const r = validateEligibility({ eligibilityMode: "EXPLICIT", eligibleParticipantIds: [] });
    expect(r.fieldErrors[0].code).toBe("REQUIRED");
  });

  it("EXPLICIT 名单去重", () => {
    const r = validateEligibility({
      eligibilityMode: "EXPLICIT",
      eligibleParticipantIds: ["p1", "p1", "p2", " "],
    });
    expect(r.ids).toEqual(["p1", "p2"]);
  });

  it("非法模式报错", () => {
    const r = validateEligibility({ eligibilityMode: "SOME" });
    expect(r.fieldErrors[0].field).toBe("eligibilityMode");
  });

  it("未传模式时不做判断（PATCH 场景）", () => {
    expect(validateEligibility({})).toEqual({ fieldErrors: [] });
  });
});

describe("validateTopicCreate", () => {
  it("缺必填字段一次性全部报出", () => {
    const { fieldErrors } = validateTopicCreate({});
    const fields = fieldErrors.map((e) => e.field);
    expect(fields).toContain("title");
    expect(fields).toContain("capacity");
    expect(fields).toContain("eligibilityMode");
  });

  it("完整输入无错误", () => {
    const { fieldErrors, values } = validateTopicCreate({
      title: "题目",
      description: "",
      tags: [],
      capacity: 2,
      eligibilityDescription: "",
      eligibilityMode: "ALL",
      expectedConfigVersion: 0,
    });
    expect(fieldErrors).toEqual([]);
    expect(values.eligibilityMode).toBe("ALL");
  });
});

describe("视图映射", () => {
  it("教师视角带限定名单（ALL 时为空数组）", () => {
    const view = toTeacherTopicView(baseRow, ["p1"]);
    expect(view.eligibleParticipantIds).toEqual([]);
    expect(view.heat.preferenceCount).toBe(2);
    expect((view as { canChoose?: boolean }).canChoose).toBeUndefined();
  });

  it("教师视角 EXPLICIT 带实际名单", () => {
    const view = toTeacherTopicView(
      { ...baseRow, eligibility_mode: "EXPLICIT" },
      ["p1", "p2"],
    );
    expect(view.eligibleParticipantIds).toEqual(["p1", "p2"]);
  });

  it("学生视角不含 eligibleParticipantIds", () => {
    const view = toStudentTopicView(baseRow, [], "p1");
    expect((view as { eligibleParticipantIds?: string[] }).eligibleParticipantIds).toBeUndefined();
    expect(view.canChoose).toBe(true);
  });

  it("学生视角 EXPLICIT 按 participantId 判定 canChoose", () => {
    const row = { ...baseRow, eligibility_mode: "EXPLICIT" as const };
    expect(toStudentTopicView(row, ["p1"], "p1").canChoose).toBe(true);
    expect(toStudentTopicView(row, ["p1"], "p2").canChoose).toBe(false);
  });

  it("tags 为 null 时归一为空数组", () => {
    const view = toTeacherTopicView({ ...baseRow, tags: null }, []);
    expect(view.tags).toEqual([]);
  });
});
