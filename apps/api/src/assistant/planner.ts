import type { AssistantDraft } from "./model.js";
import { currentGapQuestion } from "./turn.js";

/** 规划只允许落在这条固定清单上，模型不能另起子任务。 */
export interface Subtask {
  id: string;
  goal: string;
}

export function planNext(draft: AssistantDraft): Subtask {
  const question = currentGapQuestion(draft);
  if (question) return { id: draft.awaiting ?? "collect", goal: question };
  if (!draft.activityId) return { id: "confirm-create", goal: "信息已经齐了，等待老师确认创建。不要自己写入。" };
  if (!draft.rosterWritten || !draft.topicWritten) {
    return { id: "confirm-create", goal: "名单或课程还没写完，等待老师确认补写。" };
  }
  if (draft.lifecycle === "DRAFT") {
    return { id: "await-publish", goal: "草稿已在库里。只有老师提出发布时，才进入发布确认。" };
  }
  if (draft.lifecycle === "PUBLISHED") {
    return { id: "await-freeze", goal: "已发布。截止后老师才能确认冻结，冻结之后才能确认主分配。" };
  }
  return { id: "done", goal: "主分配已完成。只能说明现状，不能再改名单或重跑规则。" };
}
