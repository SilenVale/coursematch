import { describe, expect, it } from "vitest";
import {
  TOPICS_PER_ACTIVITY,
  derivePhase,
  validateExpectedVersion,
  validatePreferenceWrite,
  writeBlockedByPhase,
} from "./preferences-rules.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const START = new Date("2026-10-20T00:00:00Z");
const DEADLINE = new Date("2026-10-27T00:00:00Z");

describe("derivePhase", () => {
  it("按数据库时钟判定填报中与已截止", () => {
    expect(derivePhase("PUBLISHED", START, DEADLINE, new Date("2026-10-21T00:00:00Z"))).toBe(
      "FILLING",
    );
    expect(derivePhase("PUBLISHED", START, DEADLINE, new Date("2026-10-19T00:00:00Z"))).toBe(
      "NOT_STARTED",
    );
    // 恰好等于截止时间即视为已截止
    expect(derivePhase("PUBLISHED", START, DEADLINE, DEADLINE)).toBe("DEADLINE_REACHED");
    expect(derivePhase("PUBLISHED", START, DEADLINE, new Date("2026-10-28T00:00:00Z"))).toBe(
      "DEADLINE_REACHED",
    );
  });

  it("作废与关闭优先于时间判定", () => {
    expect(derivePhase("VOID", START, DEADLINE, new Date("2026-10-21T00:00:00Z"))).toBe("VOID");
    expect(derivePhase("CLOSED", START, DEADLINE, new Date("2026-10-21T00:00:00Z"))).toBe(
      "CLOSED",
    );
  });
});

describe("writeBlockedByPhase", () => {
  it("只有填报中可以写", () => {
    expect(writeBlockedByPhase("FILLING")).toBeNull();
    expect(writeBlockedByPhase("NOT_STARTED")?.code).toBe("NOT_STARTED");
    expect(writeBlockedByPhase("DEADLINE_REACHED")?.code).toBe("DEADLINE_REACHED");
    expect(writeBlockedByPhase("ALLOCATED")?.code).toBe("DEADLINE_REACHED");
    expect(writeBlockedByPhase("CLOSED")?.code).toBe("ACTIVITY_CLOSED");
    expect(writeBlockedByPhase("VOID")?.code).toBe("ACTIVITY_VOID");
    expect(writeBlockedByPhase("DRAFT")?.status).toBe(404);
  });
});

describe("validatePreferenceWrite", () => {
  it("接受恰好 1 个 topicId", () => {
    const parsed = validatePreferenceWrite({ topicIds: [uuid(1)] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.topicIds).toEqual([uuid(1)]);
  });

  it("拒绝多于 1 个班", () => {
    const parsed = validatePreferenceWrite({ topicIds: [uuid(1), uuid(2)] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.fieldErrors[0].code).toBe("OUT_OF_RANGE");
    expect(TOPICS_PER_ACTIVITY).toBe(1);
  });

  it("拒绝重复题目", () => {
    const parsed = validatePreferenceWrite({ topicIds: [uuid(1), uuid(1)] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.fieldErrors.some((e) => e.code === "DUPLICATE" || e.code === "OUT_OF_RANGE")).toBe(
        true,
      );
    }
  });

  it("空列表按未提交之前的非法输入拒绝", () => {
    const parsed = validatePreferenceWrite({ topicIds: [] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.fieldErrors[0].code).toBe("REQUIRED");
  });

  it("拒绝非 UUID 的题目 ID", () => {
    const parsed = validatePreferenceWrite({ topicIds: ["not-a-uuid"] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.fieldErrors[0].code).toBe("INVALID_FORMAT");
  });
});

describe("validateExpectedVersion", () => {
  it("0 表示首次保存，负数与非整数被拒绝", () => {
    expect(validateExpectedVersion(0)).toEqual([]);
    expect(validateExpectedVersion(2)).toEqual([]);
    expect(validateExpectedVersion(-1)).toHaveLength(1);
    expect(validateExpectedVersion(1.5)).toHaveLength(1);
    expect(validateExpectedVersion(undefined)).toHaveLength(1);
  });
});
