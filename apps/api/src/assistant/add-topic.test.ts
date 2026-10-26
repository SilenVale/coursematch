import { describe, expect, it } from "vitest";
import { tryAddTopicBeforeCreate, tryAddTopicTurn } from "./add-topic.js";
import { emptyDraft } from "./model.js";

describe("添加授课教师", () => {
  it("创建前说再加老师，应仍弹出确认创建并排队 pendingAddTopic", () => {
    const draft = emptyDraft();
    draft.title = "助理验收";
    draft.deadlineAt = "2026-11-20T10:00:00.000Z";
    draft.startAt = "2026-11-01T01:00:00.000Z";
    draft.rosterText = "学号,姓名\n20261001,甲";
    draft.topic = {
      courseName: "数据结构与算法",
      instructor: "李老师",
      schedule: "周四 7-8 节",
      capacity: 30,
    };
    const result = tryAddTopicBeforeCreate(
      draft,
      "我现在还想加个老师刘老师，时间和名额是一样的",
      { instructor: "刘老师" },
    );
    expect(result?.confirm?.action).toBe("create");
    expect(result?.draft.pendingAddTopic?.instructor).toMatch(/刘老师/);
    expect(result?.draft.pending).toBe("create");
  });

  it("已创建活动后提出新增老师，应出确认卡而非空口答应", () => {
    const draft = emptyDraft();
    draft.activityId = "act-1";
    draft.configVersion = 2;
    draft.lifecycle = "DRAFT";
    draft.title = "助理验收";
    draft.topicWritten = true;
    draft.rosterWritten = true;
    draft.topic = {
      courseName: "数据结构与算法",
      instructor: "李老师",
      schedule: "周四 7-8 节",
      capacity: 30,
    };
    const result = tryAddTopicTurn(
      draft,
      "这个课程我还想新增一个老师，就是刘老师，时间是一样的",
      { instructor: "刘老师" },
    );
    expect(result?.confirm?.action).toBe("add_topic");
    expect(result?.draft.pendingAddTopic?.instructor).toBe("刘老师");
    expect(result?.draft.pendingAddTopic?.schedule).toBe("周四 7-8 节");
  });

  it("已创建后说分别教，应弹出确认添加而非合并记录", () => {
    const draft = emptyDraft();
    draft.activityId = "act-1";
    draft.configVersion = 2;
    draft.lifecycle = "DRAFT";
    draft.title = "助理验收";
    draft.topicWritten = true;
    draft.rosterWritten = true;
    draft.topic = {
      courseName: "数据结构与算法",
      instructor: "李老师、刘老师",
      schedule: "周四 7-8 节",
      capacity: 30,
    };
    const result = tryAddTopicTurn(
      draft,
      "不是这个意思，我的意思是李老师刘老师分别教这门课，是分教室的",
      {},
    );
    expect(result?.confirm?.action).toBe("add_topic");
    expect(result?.draft.topic.instructor).toBe("李老师");
    expect(result?.draft.pendingAddTopic?.instructor).toBe("刘老师");
  });
});
