import type { ExtractUpdate } from "./extract.js";
import {
  looksLikeMultipleInstructors,
  parseTeachersInText,
  primaryInstructorField,
  sanitizeSingleInstructor,
} from "./instructor-slots.js";
import type { AssistantDraft, AssistantTopic, TurnResult } from "./model.js";

export function isAddTopicIntent(text: string): boolean {
  if (/新增|再加|多一|还有|另一位|第二个|还想.*老师|再开一门|添加.*老师/.test(text)) return true;
  if (/分别|各自|分教室|不同教室|各教|不是.*意思|不对|分开教/.test(text) && parseTeachersInText(text).length >= 2) {
    return true;
  }
  return false;
}

export function isDualTeacherMessage(text: string): boolean {
  return parseTeachersInText(text).length >= 2;
}

function resolveAdditionalInstructor(base: AssistantTopic, update: ExtractUpdate, text: string): string | null {
  const primary = primaryInstructorField(base.instructor);
  const fromUpdate = sanitizeSingleInstructor(update.instructor);
  if (fromUpdate && fromUpdate !== primary) return fromUpdate;

  for (const name of parseTeachersInText(text)) {
    if (name !== primary) return name;
  }
  if (looksLikeMultipleInstructors(base.instructor)) {
    const parts = parseTeachersInText(base.instructor);
    if (parts.length >= 2) return parts[1];
  }
  return parseInstructorHint(text);
}

function parseInstructorHint(text: string): string | null {
  const labeled =
    text.match(/(?:再加|新增|添加|还有|就是).*?([^\s、，,和与]{1,8}老师)/)?.[1] ??
    text.match(/就是\s*([^，,。\s、]{1,10})/)?.[1];
  if (!labeled) return null;
  const withSuffix = labeled.endsWith("老师") ? labeled : `${labeled}老师`;
  return sanitizeSingleInstructor(withSuffix) ?? null;
}

export function buildAddTopic(base: AssistantTopic, update: ExtractUpdate, text: string): AssistantTopic | null {
  const instructor = resolveAdditionalInstructor(base, update, text);
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
  if (!isAddTopicIntent(message) && !isDualTeacherMessage(message)) return null;

  const addTopic = buildAddTopic(draft.topic, update, message);
  if (!addTopic?.instructor) {
    return {
      draft,
      reply: "要新增哪位授课教师？例如：「再加刘老师，时间和名额跟之前一样」。",
      confirm: null,
      execute: null,
    };
  }
  const primary = primaryInstructorField(draft.topic.instructor);
  const normalizedDraft =
    primary !== draft.topic.instructor.trim()
      ? { ...draft, topic: { ...draft.topic, instructor: primary } }
      : draft;
  if (addTopic.instructor === primary) {
    return {
      draft: normalizedDraft,
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
    draft: { ...normalizedDraft, pending: "add_topic", pendingAddTopic: addTopic },
    reply:
      "可选课按「一位教师一行」分开。请确认是否添加第二位教师的课；确认后才会写入课程设置。若已有行里仍显示两位教师合在一起，请在「开设课程」里编辑第一行只保留一位教师。",
    confirm: { action: "add_topic", summary },
    execute: null,
  };
}

/** 一句话里两位教师：第一位写入草稿 topic，第二位排队 pendingAddTopic。 */
export function tryDualTeacherBeforeCreate(
  draft: AssistantDraft,
  message: string,
  update: ExtractUpdate,
): TurnResult | null {
  if (draft.activityId) return null;
  const teachers = parseTeachersInText(message);
  if (teachers.length < 2) return null;

  const primary = teachers[0];
  const secondary = teachers[1];
  const topic: AssistantTopic = {
    courseName: (update.courseName?.trim() || draft.topic.courseName).trim(),
    instructor: primary,
    schedule: (update.schedule?.trim() || draft.topic.schedule).trim(),
    capacity: update.capacity ?? draft.topic.capacity,
  };
  const queued = buildAddTopic({ ...topic, instructor: primary }, { instructor: secondary }, message);
  if (!queued) return null;

  const next: AssistantDraft = {
    ...draft,
    topic,
    pendingAddTopic: queued,
  };

  if (gapsFilledForCreate(next)) {
    const summary = [
      `名称：${next.title}`,
      `课程：${primary} · ${topic.courseName}，${topic.schedule}，名额 ${topic.capacity}`,
      `创建成功后待添加：${queued.instructor} · ${queued.courseName}（${queued.schedule}，名额 ${queued.capacity}）`,
    ];
    return {
      draft: { ...next, pending: "create" },
      reply: `已按两位教师分两行：先创建 ${primary} 的课，确认后会再带你添加 ${queued.instructor} 的课。`,
      confirm: { action: "create", summary },
      execute: null,
    };
  }

  return {
    draft: next,
    reply: `已记下 ${primary} 与 ${queued.instructor} 分两行开设。请继续补全活动信息；信息齐了会一起弹出确认创建。`,
    confirm: null,
    execute: null,
  };
}
