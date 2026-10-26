import { normalizeModelJson } from "./deepseek.js";
import type { ExtractUpdate } from "./extract.js";
import { extractSlots } from "./extract.js";
import { completeChat, type LlmMessage } from "./llm.js";
import { remember, type AssistantMemory, type ChatTurn } from "./memory.js";
import { emptyDraft, isCancelMessage, isConfirmMessage, type AssistantDraft, type TurnResult } from "./model.js";
import { planNext, type Subtask } from "./planner.js";
import { SYSTEM_PROMPT } from "./prompts/system.js";
import { isWriteTool, toolAction, tools } from "./tools/index.js";
import {
  applySlots,
  currentGapQuestion,
  finishTurn,
  proposeWrite,
  reviewAfterSlots,
  step,
  withProgress,
} from "./turn.js";

const ASIDE = /你是谁|你叫什么|你能做什么|怎么用|什么意思/;

export interface AgentInput {
  apiKey: string;
  message: string;
  draft: AssistantDraft | null;
  history?: ChatTurn[];
  preferences?: string[];
  now?: Date;
}

interface Decision {
  reply: string;
  slots: unknown;
  tool: string | null;
}

/** 感知 → 思考 → 行动 → 观察。写操作停在确认闸门，不在这一轮执行。 */
export async function runAgent(input: AgentInput, think = completeChat): Promise<TurnResult> {
  const now = input.now ?? new Date();
  const draft = input.draft ?? emptyDraft();
  const message = input.message.trim();
  if (isRuledCommand(message, now) || isRosterOnly(message, now)) return step(draft, message, now);

  const memory = remember({ draft, history: input.history, preferences: input.preferences });
  const plan = planNext(memory.session);
  const content = await think(input.apiKey, perceive(memory, plan, message, now));
  return observe(draft, message, parseDecision(content), now);
}

function isRosterOnly(message: string, now: Date): boolean {
  const normalized = message.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const roster = extractSlots(normalized, now).rosterText;
  return !!roster && normalized === roster;
}

function isRuledCommand(message: string, now: Date): boolean {
  if (isConfirmMessage(message) || isCancelMessage(message)) return true;
  const slots = extractSlots(message, now);
  return /发布|冻结|主分配|执行分配|开始分配|开通账号/.test(message) && !slots.title && !slots.rosterText;
}

function perceive(memory: AssistantMemory, plan: Subtask, message: string, now: Date): LlmMessage[] {
  const clock = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const draft = memory.session;
  const recent =
    memory.shortTerm.length === 0
      ? "（没有）"
      : memory.shortTerm.map((turn) => `${turn.role === "teacher" ? "老师" : "助理"}：${turn.text}`).join("\n");
  const prefs = memory.longTerm.length === 0 ? "（没有）" : memory.longTerm.join("；");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        `当前北京时间：${clock}`,
        `当前子任务：${plan.goal}`,
        `工具：${tools.map((tool) => `${tool.name}（${tool.mode === "write" ? "写，需确认" : "读"}）`).join("、")}`,
        `长期偏好：${prefs}`,
        `会话草稿：${JSON.stringify({
          title: draft.title,
          deadlineAt: draft.deadlineAt,
          startAt: draft.startAt,
          rosterText: draft.rosterText,
          courseName: draft.topic.courseName,
          instructor: draft.topic.instructor,
          schedule: draft.topic.schedule,
          capacity: draft.topic.capacity,
          lifecycle: draft.lifecycle,
          activityId: draft.activityId,
        })}`,
        "最近对话：",
        recent,
        `老师刚才说：${message}`,
      ].join("\n"),
    },
  ];
}

function parseDecision(content: string): Decision {
  const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    return {
      reply: typeof body.reply === "string" ? body.reply.trim() : "",
      slots: body.slots ?? {},
      tool: typeof body.tool === "string" && body.tool !== "null" ? body.tool : null,
    };
  } catch {
    return { reply: content.trim(), slots: {}, tool: null };
  }
}

function isAside(message: string): boolean {
  return ASIDE.test(message) && !/截止|开始|名额|志愿|学号/.test(message);
}

function speak(reply: string, gap: string | null): string {
  const clean = reply
    .replace(/[^。！!\n]*(?:已经|已)(?:创建|发布|冻结|分配|写入|开通)[^。！!\n]*[。！!\n]?/g, "")
    .replace(/[^。！!\n]*(?:志愿个数|最多[^。！!\n]{0,16}志愿)[^。！!\n]*[。！!\n]?/g, "")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "")
    .trim()
    .slice(0, 500);
  if (!clean) return gap ?? "我是选课助理。我帮你把这场选课说清楚，确认之后才会写入。";
  if (gap && !coversGap(clean, gap)) return `${clean}\n${gap}`;
  return clean;
}

function coversGap(reply: string, gap: string): boolean {
  if (gap.startsWith("这场选课叫什么")) return /名字|叫什么/.test(reply);
  if (gap.startsWith("截止")) return reply.includes("截止");
  if (gap.startsWith("开始")) return reply.includes("开始");
  if (gap.startsWith("把参与名单")) return reply.includes("名单");
  if (gap.startsWith("要开哪一门")) return /哪一门|课程名|什么课/.test(reply);
  if (gap.startsWith("这门课的授课教师")) return /教师|老师/.test(reply);
  if (gap.startsWith("上课时间")) return reply.includes("上课");
  if (gap.startsWith("这门课的招生名额")) return reply.includes("名额");
  return reply.includes(gap.slice(0, 6));
}

function preferCurrentSlot(draft: AssistantDraft, message: string, update: ExtractUpdate): ExtractUpdate {
  if (draft.awaiting !== "title" || update.title) return update;
  const bare = message.trim();
  if (!bare || bare.length > 40 || /[，。\n？?]/.test(bare) || /课程/.test(bare)) return update;
  const { courseName: _courseName, ...rest } = update;
  return { ...rest, title: bare };
}

function observe(draft: AssistantDraft, message: string, decision: Decision, now: Date): TurnResult {
  const aside = isAside(message);
  const update = aside ? {} : preferCurrentSlot(draft, message, normalizeModelJson(decision.slots));
  if (update.courseAmbiguous) {
    const next = applySlots(draft, update, now);
    return finishTurn(
      next,
      "这句话里有两门课的名额，我没有拆开。请一次只说一门，例如「课程是热门课，授课教师张老师，上课时间周二 3-4 节，名额 1」。",
    );
  }

  let next = applySlots(draft, update, now);
  if (
    draft.awaiting === "title" &&
    next.title &&
    next.topic.courseName === next.title &&
    draft.topic.courseName === next.title
  ) {
    next = { ...next, topic: { ...next.topic, courseName: "" } };
  }
  const tool = aside ? null : decision.tool;
  if (tool === "create_activity") {
    const reviewed = reviewAfterSlots(next);
    if (reviewed.confirm) return withProgress(update, reviewed);
    return withProgress(update, finishTurn(next, speak(decision.reply, currentGapQuestion(next))));
  }
  if (tool && isWriteTool(tool)) {
    const action = toolAction(tool);
    if (action) return withProgress(update, proposeWrite(next, action));
  }
  return withProgress(update, finishTurn(next, speak(decision.reply, currentGapQuestion(next))));
}
