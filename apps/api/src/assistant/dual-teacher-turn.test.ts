import { describe, expect, it } from "vitest";
import { emptyDraft } from "./model.js";
import { step } from "./turn.js";

const NOW = new Date("2026-10-25T12:00:00.000Z");

describe("双教师创建", () => {
  it("一条消息两位教师分别带班应出确认创建并排队第二位", () => {
    const msg = [
      "活动名：双师验收1026，截止 2026-12-01 18:00，开始 2026-10-27 09:00",
      "学号,姓名,入学年,专业,班级",
      "20261001,甲,2026,计算机科学,1班",
      "课程数据结构与算法，李老师刘老师分别带班，周四7-8节，名额30",
    ].join("\n");
    const result = step(emptyDraft(), msg, NOW);
    expect(result.confirm?.action).toBe("create");
    expect(result.draft.topic.instructor).toBe("李老师");
    expect(result.draft.pendingAddTopic?.instructor).toBe("刘老师");
    expect(result.draft.title).toBe("双师验收1026");
  });

  it("信息齐了确认创建不应被 courseAmbiguous 误伤", () => {
    let draft = emptyDraft();
    draft = step(draft, "活动名称是双师演示，截止 2026-12-01 18:00，开始 2026-10-27 09:00", NOW).draft;
    draft = step(
      draft,
      "学号,姓名,入学年,专业,班级\n20261001,甲,2026,计算机科学,1班\n课程数据结构，李老师刘老师分别教，周四7-8节，名额30",
      NOW,
    ).draft;
    const result = step(draft, "信息齐了，确认创建", NOW);
    expect(result.confirm?.action).toBe("create");
    expect(result.draft.pendingAddTopic?.instructor).toBe("刘老师");
  });
});
