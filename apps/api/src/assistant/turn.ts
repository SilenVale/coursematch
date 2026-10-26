import { applyExtract, extractSlots, type ExtractUpdate } from "./extract.js";
import { beijingToIso } from "./extract.js";
import {
  emptyDraft,
  isCancelMessage,
  isConfirmMessage,
  type AssistantDraft,
  type AwaitingSlot,
  type ConfirmAction,
  type ConfirmCard,
  type TurnResult,
} from "./model.js";

function formatBeijing(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function withDefaultStart(draft: AssistantDraft, now: Date): AssistantDraft {
  if (draft.startAt || !draft.deadlineAt) return draft;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    ...draft,
    startAt: beijingToIso(get("year"), get("month"), get("day"), get("hour"), get("minute")),
  };
}

function describeGap(draft: AssistantDraft): { code: AwaitingSlot; question: string } | null {
  if (!draft.title.trim()) return { code: "title", question: "这场选课叫什么名字？" };
  if (!draft.deadlineAt) {
    return {
      code: "deadline",
      question: "截止时间是什么时候？可以说「截止明天下午」或「截止 2026-10-26 18:00」。",
    };
  }
  if (!draft.startAt || new Date(draft.startAt) >= new Date(draft.deadlineAt)) {
    return {
      code: "start",
      question: "开始时间需要早于截止。请给一个开始时间，例如「开始 2026-10-26 09:00」。",
    };
  }
  if (!draft.rosterText.trim()) {
    return {
      code: "roster",
      question: "把参与名单按五列贴过来，或点左下角加号导入 CSV：学号,姓名,入学年,专业,班级。专业要和已有学籍一致。",
    };
  }
  if (!draft.topic.courseName.trim()) return { code: "courseName", question: "要开哪一门课？" };
  if (!draft.topic.instructor.trim()) return { code: "instructor", question: "这门课的授课教师是谁？" };
  if (!draft.topic.schedule.trim()) {
    return { code: "schedule", question: "上课时间是什么？例如「周二 3-4 节」。" };
  }
  if (!draft.topic.capacity) return { code: "capacity", question: "这门课的招生名额是多少？" };
  return null;
}

function nextGap(draft: AssistantDraft): string | null {
  return describeGap(draft)?.question ?? null;
}

function stamp(result: TurnResult): TurnResult {
  const awaiting = result.confirm || result.execute ? null : (describeGap(result.draft)?.code ?? null);
  return { ...result, draft: { ...result.draft, awaiting } };
}

function rosterSummary(text: string): string {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "名单：还没有";
  const shown = lines.slice(0, 4);
  const rest = lines.length - shown.length;
  const more = rest > 0 ? `\n其余 ${rest} 行` : "";
  return `名单：${shown.join("\n")}${more}`;
}

function createSummary(draft: AssistantDraft): string[] {
  return [
    `名称：${draft.title}`,
    `时间：${formatBeijing(draft.startAt!)} → ${formatBeijing(draft.deadlineAt!)}`,
    rosterSummary(draft.rosterText),
    `课程：${draft.topic.instructor} · ${draft.topic.courseName}，${draft.topic.schedule}，名额 ${draft.topic.capacity}`,
  ];
}

function card(action: ConfirmAction, summary: string[]): ConfirmCard {
  return { action, summary };
}

function acceptedLine(update: ExtractUpdate, draft: AssistantDraft): string | null {
  const parts: string[] = [];
  if (update.title) parts.push(`名称已记下：${draft.title}`);
  if (update.deadlineAt) parts.push(`截止时间已记下：${formatBeijing(update.deadlineAt)}`);
  if (update.startAt) parts.push(`开始时间已记下：${formatBeijing(update.startAt)}`);
  if (update.rosterText) parts.push("名单已导入成功");
  if (update.courseName) parts.push(`课程已记下：${draft.topic.courseName}`);
  if (update.instructor) parts.push(`授课教师已记下：${draft.topic.instructor}`);
  if (update.schedule) parts.push(`上课时间已记下：${draft.topic.schedule}`);
  if (update.capacity) parts.push(`名额已记下：${draft.topic.capacity}`);
  return parts.length > 0 ? parts.join("，") : null;
}

/** 刚收下的内容先确认，再把下一问接上。 */
export function withProgress(update: ExtractUpdate, result: TurnResult): TurnResult {
  const accepted = acceptedLine(update, result.draft);
  if (!accepted || result.execute) return result;
  const gap = result.confirm ? null : nextGap(result.draft);
  if (gap) return { ...result, reply: `${accepted}。现在继续：${gap}` };
  return { ...result, reply: `${accepted}。${result.reply}` };
}

function readyToCreate(draft: AssistantDraft): boolean {
  return nextGap(draft) === null && !draft.activityId;
}

function intent(message: string): ConfirmAction | null {
  if (/开通账号/.test(message)) return "provision";
  if (/主分配|执行分配|开始分配/.test(message)) return "allocate";
  if (/冻结/.test(message)) return "freeze";
  if (/发布/.test(message)) return "publish";
  return null;
}

function replyForIntent(draft: AssistantDraft, action: ConfirmAction): TurnResult {
  if (action === "publish") {
    if (!draft.activityId || !draft.rosterWritten || !draft.topicWritten) {
      return {
        draft: { ...draft, pending: null },
        reply: "名单和课程都写进这场草稿之后，才能发布。",
        confirm: null,
        execute: null,
      };
    }
    if (draft.lifecycle !== "DRAFT") {
      return {
        draft: { ...draft, pending: null },
        reply: "这场选课已经不是草稿，不能再发布。",
        confirm: null,
        execute: null,
      };
    }
    const next = { ...draft, pending: "publish" as const };
    const summary = [`将发布「${draft.title}」`, "发布后名单和课程不能再改，学生可以填志愿。"];
    return {
      draft: next,
      reply: `请确认发布。\n${summary.join("\n")}\n回复「确认」后才会发布。`,
      confirm: card("publish", summary),
      execute: null,
    };
  }

  if (action === "provision") {
    if (!draft.activityId || !draft.rosterWritten) {
      return {
        draft: { ...draft, pending: null },
        reply: "名单写入之后，才能为还没账号的学号开通登录。",
        confirm: null,
        execute: null,
      };
    }
    const summary = ["将为名单里尚未开通的学号创建登录账号。"];
    return {
      draft: { ...draft, pending: "provision" },
      reply: `请确认开通账号。\n${summary[0]}\n回复「确认」后才会创建。`,
      confirm: card("provision", summary),
      execute: null,
    };
  }

  if (action === "freeze") {
    if (draft.lifecycle !== "PUBLISHED") {
      return {
        draft: { ...draft, pending: null },
        reply: "先发布，并等到截止之后，才能冻结。",
        confirm: null,
        execute: null,
      };
    }
    const summary = ["将按当前志愿生成冻结快照。未到截止时间时，服务端会拒绝。"];
    return {
      draft: { ...draft, pending: "freeze" },
      reply: `请确认冻结。\n${summary[0]}\n回复「确认」后才会冻结。`,
      confirm: card("freeze", summary),
      execute: null,
    };
  }

  if (draft.lifecycle !== "PUBLISHED" && draft.lifecycle !== "ALLOCATED") {
    return {
      draft: { ...draft, pending: null },
      reply: "冻结完成之后才能主分配。",
      confirm: null,
      execute: null,
    };
  }
  const summary = ["将执行一次主分配。结果由现有分配规则计算。"];
  return {
    draft: { ...draft, pending: "allocate" },
    reply: `请确认主分配。\n${summary[0]}\n回复「确认」后才会执行。`,
    confirm: card("allocate", summary),
    execute: null,
  };
}

export function applySlots(draft: AssistantDraft, update: ExtractUpdate, now: Date): AssistantDraft {
  return withDefaultStart(applyExtract(draft, update), now);
}

export function currentGapQuestion(draft: AssistantDraft): string | null {
  return nextGap(draft);
}

/** 槽位已经写进草稿之后，只判断要不要出创建确认卡。 */
export function reviewAfterSlots(draft: AssistantDraft): TurnResult {
  return stamp(reviewDraft(draft));
}

export function proposeWrite(draft: AssistantDraft, action: ConfirmAction): TurnResult {
  return stamp(replyForIntent(draft, action));
}

export function finishTurn(draft: AssistantDraft, reply: string): TurnResult {
  return stamp({ draft, reply, confirm: null, execute: null });
}

function reviewDraft(draft: AssistantDraft): TurnResult {
  if (!draft.activityId) {
    const gap = nextGap(draft);
    if (gap) return { draft, reply: gap, confirm: null, execute: null };
    if (readyToCreate(draft)) {
      const next = { ...draft, pending: "create" as const };
      const summary = createSummary(next);
      return {
        draft: next,
        reply: "信息齐了。",
        confirm: card("create", summary),
        execute: null,
      };
    }
  }

  if (draft.activityId && draft.lifecycle === "DRAFT" && (!draft.rosterWritten || !draft.topicWritten)) {
    const gap = nextGap(draft);
    if (gap) return { draft, reply: gap, confirm: null, execute: null };
    const next = { ...draft, pending: "create" as const };
    const summary = ["将继续把还没写完的名单或课程写入这场草稿。", ...createSummary(next)];
    return {
      draft: next,
      reply: "名单或课程还没写完。确认之后只补剩下的步骤。",
      confirm: card("create", summary),
      execute: null,
    };
  }

  return {
    draft,
    reply: "记下了。要发布请说「发布」；截止后可以说「冻结」，然后再说「主分配」。",
    confirm: null,
    execute: null,
  };
}

export function step(
  inputDraft: AssistantDraft | null,
  message: string,
  now = new Date(),
  extracted?: ExtractUpdate,
): TurnResult {
  return stamp(planTurn(inputDraft, message, now, extracted));
}

function planTurn(
  inputDraft: AssistantDraft | null,
  message: string,
  now: Date,
  extracted?: ExtractUpdate,
): TurnResult {
  const draft = inputDraft ?? emptyDraft();
  const text = message.trim();
  if (!text) {
    return { draft, reply: "说说这场选课的名称、截止时间、名单和课程。", confirm: null, execute: null };
  }

  if (isCancelMessage(text)) {
    return {
      draft: { ...draft, pending: null },
      reply: "已停下。草稿还在，可以继续补充。",
      confirm: null,
      execute: null,
    };
  }

  if (isConfirmMessage(text)) {
    if (!draft.pending) {
      return { draft, reply: "现在没有待确认的动作。", confirm: null, execute: null };
    }
    return { draft, reply: "正在执行。", confirm: null, execute: draft.pending };
  }

  const wanted = intent(text);
  if (wanted && !extractSlots(text, now).title && !extractSlots(text, now).rosterText) {
    return replyForIntent(draft, wanted);
  }

  const update = extracted ?? extractSlots(text, now);
  let next = withDefaultStart(applyExtract(draft, update), now);

  if (update.courseAmbiguous) {
    return {
      draft: next,
      reply: "这句话里有两门课的名额，我没有拆开。请一次只说一门，例如「课程是热门课，授课教师张老师，上课时间周二 3-4 节，名额 1」。",
      confirm: null,
      execute: null,
    };
  }

  let result: TurnResult;
  if (!next.activityId) {
    const gap = nextGap(next);
    if (gap) result = { draft: next, reply: gap, confirm: null, execute: null };
    else if (readyToCreate(next)) {
      next = { ...next, pending: "create" };
      const summary = createSummary(next);
      result = {
        draft: next,
        reply: "信息齐了。",
        confirm: card("create", summary),
        execute: null,
      };
    } else {
      result = {
        draft: next,
        reply: "记下了。要发布请说「发布」；截止后可以说「冻结」，然后再说「主分配」。",
        confirm: null,
        execute: null,
      };
    }
  } else if (next.activityId && next.lifecycle === "DRAFT" && (!next.rosterWritten || !next.topicWritten)) {
    const gap = nextGap(next);
    if (gap) result = { draft: next, reply: gap, confirm: null, execute: null };
    else {
      next = { ...next, pending: "create" };
      const summary = ["将继续把还没写完的名单或课程写入这场草稿。", ...createSummary(next)];
      result = {
        draft: next,
        reply: "名单或课程还没写完。确认之后只补剩下的步骤。",
        confirm: card("create", summary),
        execute: null,
      };
    }
  } else if (wanted) {
    result = replyForIntent(next, wanted);
  } else {
    result = {
      draft: next,
      reply: "记下了。要发布请说「发布」；截止后可以说「冻结」，然后再说「主分配」。",
      confirm: null,
      execute: null,
    };
  }
  return withProgress(update, result);
}
