import { describe, expect, it } from "vitest";
import { runAgent } from "./agent.js";
import type { LlmMessage } from "./llm.js";
import { emptyDraft } from "./model.js";

const NOW = new Date("2026-10-25T12:00:00.000Z");

function thinkReturning(json: unknown) {
  return async (_apiKey: string, _messages: LlmMessage[]) => JSON.stringify(json);
}

describe("选课助理循环", () => {
  it("正在问名称时，短回答记成活动名称", async () => {
    const draft = emptyDraft();
    draft.awaiting = "title";
    draft.topic.courseName = "数据结构";
    const result = await runAgent(
      { apiKey: "sk-test", message: "数据结构", draft, now: NOW },
      thinkReturning({ reply: "课程已记下。", slots: { courseName: "数据结构" }, tool: null }),
    );
    expect(result.draft.title).toBe("数据结构");
    expect(result.draft.topic.courseName).toBe("");
    expect(result.reply).toContain("名称已记下：数据结构");
    expect(result.reply).toContain("现在继续");
    expect(result.reply).toContain("截止");
    expect(result.reply).not.toContain("课程已记下");
  });

  it("短回答仍然写进当前槽位", async () => {
    const result = await runAgent(
      { apiKey: "sk-test", message: "数据结构", draft: emptyDraft(), now: NOW },
      thinkReturning({ reply: "名称记下了。", slots: { title: "数据结构" }, tool: null }),
    );
    expect(result.draft.title).toBe("数据结构");
    expect(result.reply).toContain("名称已记下：数据结构");
    expect(result.reply).toContain("现在继续");
    expect(result.reply).toContain("截止");
    expect(result.execute).toBeNull();
  });

  it("模型已经问过当前缺口时，不再把同一句拼上去", async () => {
    const draft = emptyDraft();
    draft.title = "数据结构";
    const result = await runAgent(
      { apiKey: "sk-test", message: "你是谁", draft, now: NOW },
      thinkReturning({ reply: "我是选课助理。先说说截止时间吧。", slots: {}, tool: null }),
    );
    expect(result.reply).toBe("我是选课助理。先说说截止时间吧。");
  });

  it("整份名单 CSV 不交给模型改写", async () => {
    const draft = emptyDraft();
    draft.title = "数据结构";
    draft.deadlineAt = "2026-10-27T02:00:00.000Z";
    const csv = "学号,姓名,入学年,专业,班级\n20260001,学生甲,2026,软件工程,1班";
    const result = await runAgent(
      { apiKey: "sk-test", message: csv, draft, now: NOW },
      async () => {
        throw new Error("不应该调用模型");
      },
    );
    expect(result.draft.rosterText).toContain("20260001");
    expect(result.reply).toContain("名单已导入成功");
    expect(result.reply).toContain("现在继续");
    expect(result.reply).toContain("课");
    expect(result.execute).toBeNull();
  });

  it("模型提到志愿个数时，这句话不会展示给老师", async () => {
    const draft = emptyDraft();
    draft.title = "数据结构";
    draft.deadlineAt = "2026-10-27T02:00:00.000Z";
    const result = await runAgent(
      { apiKey: "sk-test", message: "截止 2026-10-27 10:00", draft, now: NOW },
      thinkReturning({
        reply:
          "好的，截止时间记为 2026-10-27 10:00（北京时间）。接下来还缺志愿个数、名单和一门课，先说说每位学生最多填几个志愿吧。",
        slots: {},
        tool: null,
      }),
    );
    expect(result.reply).toContain("截止时间记为");
    expect(result.reply).not.toContain("志愿个数");
    expect(result.reply).not.toContain("最多填几个");
    expect(result.reply).toContain("名单");
  });

  it("老师问你是谁时先回答，再把当前缺口问回去", async () => {
    const draft = emptyDraft();
    draft.title = "数据结构";
    draft.awaiting = "deadline";
    let called = 0;
    const result = await runAgent(
      {
        apiKey: "sk-test",
        message: "你是谁",
        draft,
        now: NOW,
      },
      async () => {
        called += 1;
        return JSON.stringify({
          reply: "我是选课助理，帮你把这场选课说清楚。确认之后才会写入。已经发布了。",
          slots: { title: "你是谁" },
          tool: "publish_activity",
        });
      },
    );
    expect(called).toBe(1);
    expect(result.execute).toBeNull();
    expect(result.confirm).toBeNull();
    expect(result.draft.title).toBe("数据结构");
    expect(result.reply).toContain("选课助理");
    expect(result.reply).not.toContain("已经发布");
    expect(result.reply).toContain("截止时间");
  });

  it("模型提出发布时，条件不够就停住，不执行", async () => {
    const result = await runAgent(
      { apiKey: "sk-test", message: "帮我把这门课发出去", draft: emptyDraft(), now: NOW },
      thinkReturning({ reply: "好，已经发布了。", slots: {}, tool: "publish_activity" }),
    );
    expect(result.execute).toBeNull();
    expect(result.confirm).toBeNull();
    expect(result.reply).toContain("才能发布");
  });

  it("信息齐了才出创建确认卡", async () => {
    const draft = emptyDraft();
    draft.title = "数据结构";
    draft.startAt = "2026-10-26T01:00:00.000Z";
    draft.deadlineAt = "2026-10-26T07:00:00.000Z";
    draft.maxPreferences = 3;
    draft.rosterText = "学号,姓名,入学年,专业,班级\n20260001,学生甲,2026,软件工程,1班";
    draft.topic = { courseName: "数据结构", instructor: "张老师", schedule: "周三下午", capacity: 1 };
    const result = await runAgent(
      { apiKey: "sk-test", message: "就这样创建", draft, now: NOW },
      thinkReturning({ reply: "已经创建好了。", slots: {}, tool: "create_activity" }),
    );
    expect(result.execute).toBeNull();
    expect(result.confirm?.action).toBe("create");
    expect(result.draft.pending).toBe("create");
    expect(result.reply).toBe("信息齐了。");
  });

  it("确认不会再去问模型", async () => {
    const draft = emptyDraft();
    draft.pending = "create";
    const result = await runAgent(
      { apiKey: "sk-test", message: "确认", draft, now: NOW },
      async () => {
        throw new Error("不应该调用模型");
      },
    );
    expect(result.execute).toBe("create");
  });
});
