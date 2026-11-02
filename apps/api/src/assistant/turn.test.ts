import { describe, expect, it } from "vitest";
import { beijingToIso } from "./extract.js";
import { emptyDraft } from "./model.js";
import { step } from "./turn.js";

const NOW = new Date("2026-10-25T12:00:00.000Z");

function confirmCatalog(draft: ReturnType<typeof emptyDraft>) {
  const named = step(draft, "软件工程", NOW);
  expect(named.confirm?.action).toBe("catalog");
  return step(named.draft, "确认", NOW).draft;
}

describe("教师选课助理对话", () => {
  it("缺课种时先问课种", () => {
    const result = step(emptyDraft(), "最多 3 个志愿，截止明天下午", NOW);
    expect(result.execute).toBeNull();
    expect(result.confirm).toBeNull();
    expect(result.reply).toContain("课");
    expect(result.draft.maxPreferences).toBe(3);
    expect(result.draft.deadlineAt).toBe(beijingToIso(2026, 10, 26, 15, 0));
  });

  it("一条消息填齐时先确认课种", () => {
    const result = step(
      emptyDraft(),
      [
        "软件工程",
        "最多 3 个志愿",
        "截止 2026-10-26 18:00",
        "开始 2026-10-26 09:00",
        "授课教师张老师，上课时间周二 3-4 节，名额 1",
        "学号,姓名,入学年,专业,班级",
        "20260001,学生甲,2026,软件工程,1班",
      ].join("\n"),
      NOW,
    );
    expect(result.execute).toBeNull();
    expect(result.confirm?.action).toBe("catalog");
    const ack = step(result.draft, "确认", NOW);
    const create = step(ack.draft, "信息齐了，确认创建", NOW);
    expect(create.confirm?.action).toBe("create");
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

  it("确认课种后可以继续填截止", () => {
    const first = step(emptyDraft(), "软件工程", NOW);
    expect(first.confirm?.action).toBe("catalog");
    const second = step(first.draft, "确认", NOW);
    expect(second.draft.catalogAcknowledged).toBe(true);
    expect(second.draft.title).toBe("软件工程");
    expect(second.reply).toContain("截止");
  });

  it("确认创建卡出现后，回复确认才标记执行", () => {
    let draft = emptyDraft();
    draft = confirmCatalog(draft);
    draft.deadlineAt = beijingToIso(2026, 10, 26, 18, 0);
    draft.startAt = beijingToIso(2026, 10, 26, 9, 0);
    draft.topic = {
      courseName: "软件工程",
      instructor: "张老师",
      schedule: "周二 3-4 节",
      capacity: 1,
    };
    draft.rosterText = "学号,姓名,入学年,专业,班级\n20260001,学生甲,2026,软件工程,1班";
    const ready = step(draft, "信息齐了，确认创建", NOW);
    expect(ready.confirm?.action).toBe("create");
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
    draft.title = "软件工程";
    draft.catalogAcknowledged = true;
    draft.topic.courseName = "软件工程";
    draft.startAt = "2026-10-26T01:00:00.000Z";
    draft.deadlineAt = "2026-10-26T10:00:00.000Z";
    draft.maxPreferences = 1;
    draft.rosterText = "学号,姓名,入学年,专业,班级\n20260001,学生甲,2026,软件工程,1班";
    draft.topic = {
      courseName: "软件工程",
      instructor: "张老师",
      schedule: "周二 3-4 节",
      capacity: 1,
    };
    const result = step(draft, "名单已改好", NOW);
    expect(result.execute).toBeNull();
    expect(result.confirm?.action).toBe("create");
    expect(result.draft.pending).toBe("create");
  });

  it("上一问是课种时，短回答可以写成课种", () => {
    const first = step(emptyDraft(), "我想进行一轮新的选课", NOW);
    expect(first.reply).toContain("课");
    expect(first.draft.awaiting).toBe("courseName");

    const second = step(first.draft, "数据结构", NOW);
    expect(second.draft.topic.courseName).toBe("数据结构");
    expect(second.confirm?.action).toBe("catalog");
  });

  it("整份 CSV 记成名单后不再问课名", () => {
    let draft = emptyDraft();
    draft = confirmCatalog(draft);
    draft.title = "软件工程";
    draft.topic.courseName = "软件工程";
    draft.deadlineAt = beijingToIso(2026, 10, 27, 10, 0);
    draft.startAt = beijingToIso(2026, 10, 27, 9, 0);
    draft.topic.instructor = "张老师";
    draft.topic.schedule = "周二 3-4 节";
    draft.topic.capacity = 30;
    const csv = "学号,姓名,入学年,专业,班级\n20260001,学生甲,2026,软件工程,1班";
    const result = step(draft, csv, NOW);
    expect(result.draft.rosterText).toContain("20260001,学生甲");
    expect(result.reply).toContain("名单已导入成功");
    expect(result.confirm?.action).toBe("create");
    expect(result.reply).not.toContain("要开哪一门课");
    expect(result.execute).toBeNull();
  });

  it("不向老师询问志愿个数，课种确认之后直接问截止", () => {
    let draft = confirmCatalog(emptyDraft());
    draft.topic.courseName = "数据结构";
    draft.title = "数据结构";
    const result = step(draft, "好的", NOW);
    expect(result.reply).not.toContain("志愿");
    expect(result.reply).toContain("截止");
    expect(result.draft.maxPreferences).toBeNull();
  });

  it("课种确认后活动名称与课种一致", () => {
    const draft = confirmCatalog(emptyDraft());
    expect(draft.title).toBe("软件工程");
    expect(draft.topic.courseName).toBe("软件工程");
  });
});
