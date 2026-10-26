import { describe, expect, it } from "vitest";
import { tryAddTopicTurn } from "./add-topic.js";
import { emptyDraft } from "./model.js";

describe("添加授课教师", () => {
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
});
