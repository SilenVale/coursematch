import type { ExtractUpdate } from "./extract.js";
import type { AssistantDraft, AssistantTopic, TurnResult } from "./model.js";

export function isAddTopicIntent(text: string): boolean {
  return /新增|再加|多一|还有|另一位|第二个|还想.*老师|再开一门|添加.*老师/.test(text);
}

function parseInstructorHint(text: string): string | null {
  const labeled =
    text.match(/就是\s*([^，,。\s]{1,10})/)?.[1] ??
    text.match(/新增.*?([^\s，,。]{1,8}老师)/)?.[1] ??
    text.match(/([^\s，,。]{1,6}老师)/)?.[1];
  if (!labeled) return null;
  return labeled.endsWith("老师") ? labeled : `${labeled}老师`;
}

export function buildAddTopic(base: AssistantTopic, update: ExtractUpdate, text: string): AssistantTopic | null {
  const instructor = (update.instructor?.trim() || parseInstructorHint(text) || "").trim();
  if (!instructor) return null;
  const sameTime = /时间一样|同样时间|时间不变|同上/.test(text);
  return {
    courseName: (update.courseName?.trim() || base.courseName).trim(),
    instructor,
    schedule: (sameTime ? base.schedule : update.schedule?.trim() || base.schedule).trim(),
    capacity: update.capacity ?? base.capacity,
  };
}

export function tryAddTopicTurn(
  draft: AssistantDraft,
  message: string,
  update: ExtractUpdate,
): TurnResult | null {
  if (!draft.activityId || !draft.topicWritten || draft.lifecycle !== "DRAFT") return null;
  if (!isAddTopicIntent(message)) return null;

  const addTopic = buildAddTopic(draft.topic, update, message);
  if (!addTopic?.instructor) {
    return {
      draft,
      reply: "要新增哪位授课教师？例如：「再加刘老师，时间和名额跟之前一样」。",
      confirm: null,
      execute: null,
    };
  }
  if (addTopic.instructor === draft.topic.instructor) {
    return {
      draft,
      reply: "这位老师和已有课程重复了。请说另一位教师，或到「课程设置 → 开设课程」里点「添加教师课程」。",
      confirm: null,
      execute: null,
    };
  }
  if (!addTopic.courseName || !addTopic.schedule || !addTopic.capacity) {
    return {
      draft,
      reply: "新课程还缺课程名、上课时间或名额，请补全后再确认添加。",
      confirm: null,
      execute: null,
    };
  }

  const summary = [
    `将在「${draft.title}」中新增一门可选课：`,
    `${addTopic.instructor} · ${addTopic.courseName}`,
    `${addTopic.schedule}，名额 ${addTopic.capacity}`,
  ];
  return {
    draft: { ...draft, pending: "add_topic", pendingAddTopic: addTopic },
    reply: "请确认是否添加这门课。确认后才会写入课程设置。",
    confirm: { action: "add_topic", summary },
    execute: null,
  };
}
