import { describe, expect, it } from "vitest";
import { normalizeModelJson } from "./deepseek.js";
import { beijingToIso } from "./extract.js";

describe("DeepSeek 槽位", () => {
  it("只收下合法字段", () => {
    const update = normalizeModelJson({
      title: "数据结构",
      deadline: "2026-10-26 15:00",
      maxPreferences: 4,
      capacity: 1,
      courseName: "数据结构",
      courseAmbiguous: false,
    });
    expect(update.title).toBe("数据结构");
    expect(update.deadlineAt).toBe(beijingToIso(2026, 10, 26, 15, 0));
    expect(update.maxPreferences).toBeUndefined();
    expect(update.capacity).toBe(1);
    expect(update.courseName).toBe("数据结构");
    expect(update.courseAmbiguous).toBeUndefined();
  });
});
