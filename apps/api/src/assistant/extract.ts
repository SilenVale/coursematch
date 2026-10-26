import { sanitizeSingleInstructor } from "./instructor-slots.js";
import type { AssistantDraft } from "./model.js";

export interface ExtractUpdate {
  title?: string;
  description?: string;
  startAt?: string;
  deadlineAt?: string;
  maxPreferences?: number;
  rosterText?: string;
  courseName?: string;
  instructor?: string;
  schedule?: string;
  capacity?: number | null;
  /** 一句话里出现两个名额，不拆课。 */
  courseAmbiguous?: boolean;
}

const WEEKDAY: Record<string, number> = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

function shanghaiYmd(now: Date): { y: number; m: number; d: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

/** 把北京时间钟点转成 ISO。中国无夏令时，固定 UTC+8。 */
export function beijingToIso(y: number, m: number, d: number, hh: number, mm: number): string {
  return new Date(Date.UTC(y, m - 1, d, hh - 8, mm, 0)).toISOString();
}

function addDays(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function hourFromPhrase(phrase: string): number {
  const clock = phrase.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (clock) return Number(clock[1]);
  if (phrase.includes("上午")) return 9;
  if (phrase.includes("晚上")) return 19;
  if (phrase.includes("下午")) return 15;
  return 15;
}

function minuteFromPhrase(phrase: string): number {
  const clock = phrase.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  return clock ? Number(clock[2]) : 0;
}

function explicitDeadline(text: string, now: Date): string | null {
  const labeled = text.match(
    /截止(?:时间)?[是为：:\s]*(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/,
  );
  if (labeled) {
    return beijingToIso(
      Number(labeled[1].slice(0, 4)),
      Number(labeled[1].slice(5, 7)),
      Number(labeled[1].slice(8, 10)),
      Number(labeled[2]),
      Number(labeled[3]),
    );
  }

  const relative = text.match(
    /截止(?:时间)?[是为：:\s]*((?:明天|后天|下周[一二三四五六日])[^，。\n]{0,12})/,
  );
  if (!relative) return null;
  const phrase = relative[1];
  const base = shanghaiYmd(now);
  let days = 0;
  if (phrase.startsWith("明天")) days = 1;
  else if (phrase.startsWith("后天")) days = 2;
  else {
    const weekday = WEEKDAY[phrase[2]];
    if (weekday === undefined) return null;
    let delta = (weekday - base.weekday + 7) % 7;
    if (delta === 0) delta = 7;
    delta += 7;
    days = delta;
  }
  const next = addDays(base.y, base.m, base.d, days);
  return beijingToIso(next.y, next.m, next.d, hourFromPhrase(phrase), minuteFromPhrase(phrase));
}

function extractRoster(text: string): string | undefined {
  const headerAt = text.indexOf("学号");
  if (headerAt >= 0 && text.slice(headerAt).includes(",")) {
    return text.slice(headerAt).trim();
  }
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d{5,},/.test(line));
  if (lines.length === 0) return undefined;
  return ["学号,姓名,入学年,专业,班级", ...lines].join("\n");
}

export function extractSlots(text: string, now: Date): ExtractUpdate {
  const update: ExtractUpdate = {};

  const title =
    text.match(/活动名称[是为：:\s]+([^\n，。]{1,40})/) ??
    text.match(/(?:选课任务|(?<!课程)名称)[是为：:\s]+([^\n，。]{1,40})/) ??
    text.match(/叫[「“"]([^」”"]+)[」”"]/);
  if (title) update.title = title[1].trim();

  const description = text.match(/活动说明[是为：:\s]+([^\n]{1,200})/);
  if (description) update.description = description[1].trim();

  const prefs =
    text.match(/最多\s*([123])\s*个志愿/) ?? text.match(/最大志愿数[是为：:\s]*([123])/);
  if (prefs) update.maxPreferences = Number(prefs[1]);

  const deadline = explicitDeadline(text, now);
  if (deadline) update.deadlineAt = deadline;

  const start = text.match(/开始(?:时间)?[是为：:\s]*(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (start) {
    update.startAt = beijingToIso(
      Number(start[1].slice(0, 4)),
      Number(start[1].slice(5, 7)),
      Number(start[1].slice(8, 10)),
      Number(start[2]),
      Number(start[3]),
    );
  }

  const roster = extractRoster(text);
  if (roster) update.rosterText = roster;

  const capacities = [...text.matchAll(/名额\s*(\d+)/g)];
  if (capacities.length > 1) {
    update.courseAmbiguous = true;
    update.capacity = null;
  } else if (capacities.length === 1) {
    update.capacity = Number(capacities[0][1]);
    const named = text.match(/([^\s，,。\n]{2,20})名额\s*\d+/);
    if (named && !named[1].includes("志愿")) update.courseName = named[1].replace(/^课程/, "");
  }

  const course = text.match(/课程(?:名称)?[是为：:\s]+([^\s，,。]{1,30})/);
  if (course) update.courseName = course[1].trim();

  const instructor =
    text.match(/授课教师[是为：:\s]+([^\s，,。]{1,20})/) ??
    text.match(/(?:再加|新增|添加|还有).*?([^\s、，,和与]{1,8}老师)/) ??
    text.match(/([^\s、，,和与]{1,8}老师)/);
  const single = sanitizeSingleInstructor(instructor?.[1]);
  if (single) update.instructor = single;

  const schedule =
    text.match(/上课时间[是为：:\s]+([^\n，。]{2,40})/) ??
    text.match(/(周[一二三四五六日天][^，。\n]{0,16})/);
  if (schedule) update.schedule = schedule[1].trim();

  return update;
}

export function applyExtract(draft: AssistantDraft, update: ExtractUpdate): AssistantDraft {
  const next: AssistantDraft = {
    ...draft,
    topic: { ...draft.topic },
    pending: null,
  };
  if (update.title) next.title = update.title;
  if (update.description !== undefined) next.description = update.description;
  if (update.startAt) next.startAt = update.startAt;
  if (update.deadlineAt) next.deadlineAt = update.deadlineAt;
  if (update.maxPreferences) next.maxPreferences = update.maxPreferences;
  if (update.rosterText) {
    next.rosterText = update.rosterText;
    next.rosterWritten = false;
  }
  if (update.courseName) {
    next.topic.courseName = update.courseName;
    next.topicWritten = false;
  }
  const instructor = sanitizeSingleInstructor(update.instructor);
  if (instructor) {
    next.topic.instructor = instructor;
    next.topicWritten = false;
  }
  if (update.schedule) {
    next.topic.schedule = update.schedule;
    next.topicWritten = false;
  }
  if (update.courseAmbiguous) {
    next.topic.capacity = null;
    next.topicWritten = false;
  } else if (update.capacity) {
    next.topic.capacity = update.capacity;
    next.topicWritten = false;
  }
  return next;
}
