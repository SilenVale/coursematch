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

function gapsFilledForCreate(draft: AssistantDraft): boolean {
  return !!(
    draft.title.trim() &&
    draft.deadlineAt &&
    draft.startAt &&
    draft.rosterText.trim() &&
    draft.topic.courseName.trim() &&
    draft.topic.instructor.trim() &&
    draft.topic.schedule.trim() &&
    draft.topic.capacity
  );
}

/** 尚未创建活动前，老师说「再加一位老师」：记入 pendingAddTopic，并继续弹出「确认创建」。 */
export function tryAddTopicBeforeCreate(
  draft: AssistantDraft,
  message: string,
  update: ExtractUpdate,
): TurnResult | null {
  if (draft.activityId || !isAddTopicIntent(message)) return null;

  const queued = buildAddTopic(draft.topic, update, message);
  if (!queued?.instructor) {
    return {
      draft,
      reply: "要新增哪位授课教师？例如：「再加刘老师，时间和名额跟之前一样」。",
      confirm: null,
      execute: null,
    };
  }
  if (queued.instructor === draft.topic.instructor) {
    return {
      draft,
      reply: "这位老师和第一场要创建的课程相同。请换一位教师，或先确认创建后再添加。",
      confirm: null,
      execute: null,
    };
  }

  const next = { ...draft, pendingAddTopic: queued };

  if (!gapsFilledForCreate(draft)) {
    return {
      draft: next,
      reply: `已记下 ${queued.instructor}。等信息齐了、确认创建后，再带你确认添加这位教师。`,
      confirm: null,
      execute: null,
    };
  }

  const summary = [
    `名称：${draft.title}`,
    `课程：${draft.topic.instructor} · ${draft.topic.courseName}（${draft.topic.schedule}，名额 ${draft.topic.capacity}）`,
    `创建成功后待添加：${queued.instructor} · ${queued.courseName}（${queued.schedule}，名额 ${queued.capacity}）`,
  ];
  return {
    draft: { ...next, pending: "create" },
    reply: `已记下 ${queued.instructor}，不会改掉 ${draft.topic.instructor} 那场课。请先确认创建；创建后会再弹出「确认添加课程」。`,
    confirm: { action: "create", summary },
    execute: null,
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
