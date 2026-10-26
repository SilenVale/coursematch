import { describe, expect, it } from "vitest";
import { beijingToIso } from "./extract.js";
import { emptyDraft } from "./model.js";
import { step } from "./turn.js";

const NOW = new Date("2026-10-25T12:00:00.000Z");

describe("教师选课助理对话", () => {
  it("缺名称时只问名称", () => {
    const result = step(emptyDraft(), "最多 3 个志愿，截止明天下午", NOW);
    expect(result.execute).toBeNull();
    expect(result.confirm).toBeNull();
    expect(result.reply).toContain("叫什么");
    expect(result.draft.maxPreferences).toBe(3);
    expect(result.draft.deadlineAt).toBe(beijingToIso(2026, 10, 26, 15, 0));
  });

  it("信息齐了只出创建确认卡，不执行", () => {
    const result = step(
      emptyDraft(),
      [
        "活动名称是浏览器验收演示",
        "最多 3 个志愿",
        "截止 2026-10-26 18:00",
        "开始 2026-10-26 09:00",
        "课程是热门课，授课教师张老师，上课时间周二 3-4 节，名额 1",
        "学号,姓名,入学年,专业,班级",
        "20260001,学生甲,2026,软件工程,1班",
      ].join("\n"),
      NOW,
    );
    expect(result.execute).toBeNull();
    expect(result.confirm?.action).toBe("create");
    expect(result.draft.pending).toBe("create");
    expect(result.draft.topic.capacity).toBe(1);
    expect(result.draft.rosterText).toContain("20260001");
  });

  it("两个名额不拆课", () => {
    const result = step(emptyDraft(), "热门课名额 1，普通课名额 30", NOW);
    expect(result.reply).toContain("两门课");
    expect(result.draft.topic.capacity).toBeNull();
    expect(result.confirm).toBeNull();
  });

  it("没有确认卡时，回复确认不会执行", () => {
    const result = step(emptyDraft(), "确认", NOW);
    expect(result.execute).toBeNull();
    expect(result.reply).toContain("没有待确认");
  });

  it("确认卡出现后，回复确认才标记执行", () => {
    const ready = step(
      emptyDraft(),
      "活动名称是浏览器验收演示\n最多 1 个志愿\n截止 2026-10-26 18:00\n开始 2026-10-26 09:00\n课程是热门课\n授课教师张老师\n上课时间周二 3-4 节\n名额 1\n学号,姓名,入学年,专业,班级\n20260001,学生甲,2026,软件工程,1班",
      NOW,
    );
    const confirmed = step(ready.draft, "确认", NOW);
    expect(confirmed.execute).toBe("create");
  });

  it("草稿未写完时不能发布", () => {
    const result = step(emptyDraft(), "发布", NOW);
    expect(result.execute).toBeNull();
    expect(result.reply).toContain("才能发布");
  });

  it("活动已建但名单未写入时，可以再次确认补写", () => {
    const draft = emptyDraft();
    draft.activityId = "act-1";
    draft.lifecycle = "DRAFT";
    draft.configVersion = 0;
    draft.title = "浏览器验收演示";
    draft.startAt = "2026-10-26T01:00:00.000Z";
    draft.deadlineAt = "2026-10-26T10:00:00.000Z";
    draft.maxPreferences = 1;
    draft.rosterText = "学号,姓名,入学年,专业,班级\n20260001,学生甲,2026,软件工程,1班";
    draft.topic = {
      courseName: "热门课",
      instructor: "张老师",
      schedule: "周二 3-4 节",
      capacity: 1,
    };
    const result = step(draft, "名单已改好", NOW);
    expect(result.execute).toBeNull();
    expect(result.confirm?.action).toBe("create");
    expect(result.draft.pending).toBe("create");
  });

  it("上一问是名称时，短回答可以写成名称", () => {
    const first = step(emptyDraft(), "我想进行一轮新的选课", NOW);
    expect(first.reply).toContain("叫什么");
    expect(first.draft.awaiting).toBe("title");
    expect(first.draft.title).toBe("");

    const second = step(first.draft, "数据结构", NOW, { title: "数据结构" });
    expect(second.draft.title).toBe("数据结构");
    expect(second.draft.awaiting).toBe("deadline");
    expect(second.reply).toContain("名称已记下：数据结构");
    expect(second.reply).toContain("现在继续");
    expect(second.reply).toContain("截止");
  });

  it("整份 CSV 记成名单，不再交给模型改写", () => {
    const draft = emptyDraft();
    draft.title = "数据结构";
    draft.deadlineAt = beijingToIso(2026, 10, 27, 10, 0);
    const csv = "学号,姓名,入学年,专业,班级\n20260001,学生甲,2026,软件工程,1班";
    const result = step(draft, csv, NOW);
    expect(result.draft.rosterText).toContain("20260001,学生甲");
    expect(result.reply).toContain("名单已导入成功");
    expect(result.reply).toContain("现在继续");
    expect(result.reply).toContain("课");
    expect(result.execute).toBeNull();
  });

  it("不向老师询问志愿个数，截止之后直接问名单", () => {
    const draft = emptyDraft();
    draft.title = "数据结构";
    draft.deadlineAt = beijingToIso(2026, 10, 27, 10, 0);
    const result = step(draft, "好的", NOW);
    expect(result.reply).not.toContain("志愿");
    expect(result.reply).toContain("名单");
    expect(result.draft.maxPreferences).toBeNull();
  });

  it("课程名称不会改掉活动名称", () => {
    const draft = emptyDraft();
    draft.title = "场景验收选课";
    const result = step(draft, "课程名称是数据结构", NOW);
    expect(result.draft.title).toBe("场景验收选课");
    expect(result.draft.topic.courseName).toBe("数据结构");
  });
});
