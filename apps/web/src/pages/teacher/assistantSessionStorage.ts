export interface AssistantTopic {
  courseName: string;
  instructor: string;
  schedule: string;
  capacity: number | null;
}

export interface AssistantDraft {
  activityId: string | null;
  configVersion: number | null;
  lifecycle: "NONE" | "DRAFT" | "PUBLISHED" | "ALLOCATED";
  title: string;
  description: string;
  startAt: string | null;
  deadlineAt: string | null;
  maxPreferences: number | null;
  rosterText: string;
  rosterWritten: boolean;
  topic: AssistantTopic;
  topicWritten: boolean;
  pending: "create" | "publish" | "provision" | "freeze" | "allocate" | null;
  awaiting?: string | null;
}

export interface ConfirmCard {
  action: string;
  summary: string[];
}

export type ChatLine = { role: "teacher" | "assistant"; text: string };

export const ASSISTANT_WELCOME: ChatLine = {
  role: "assistant",
  text: "把这场选课说清楚就行。\n需要名称、截止时间、名单和一门课。\n缺的我会逐项问。\n确认之后才会写入。",
};

interface StoredSession {
  v: 1;
  draft: AssistantDraft | null;
  lines: ChatLine[];
  confirm: ConfirmCard | null;
  updatedAt: string;
}

const MAX_STORED_LINES = 120;

function storageKey(accountId: string): string {
  return `coursematch.assistant.session.v1.${accountId}`;
}

function isChatLine(value: unknown): value is ChatLine {
  if (!value || typeof value !== "object") return false;
  const row = value as ChatLine;
  return (row.role === "teacher" || row.role === "assistant") && typeof row.text === "string";
}

function isDraft(value: unknown): value is AssistantDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as AssistantDraft;
  return typeof d.title === "string" && d.topic && typeof d.topic.courseName === "string";
}

export function loadAssistantSession(accountId: string): {
  draft: AssistantDraft | null;
  lines: ChatLine[];
  confirm: ConfirmCard | null;
} | null {
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.v !== 1 || !Array.isArray(parsed.lines)) return null;
    const lines = parsed.lines.filter(isChatLine).slice(-MAX_STORED_LINES);
    if (lines.length === 0) return null;
    const draft = parsed.draft && isDraft(parsed.draft) ? parsed.draft : null;
    const confirm =
      parsed.confirm &&
      typeof parsed.confirm.action === "string" &&
      Array.isArray(parsed.confirm.summary)
        ? parsed.confirm
        : null;
    return { draft, lines, confirm };
  } catch {
    return null;
  }
}

export function saveAssistantSession(
  accountId: string,
  input: { draft: AssistantDraft | null; lines: ChatLine[]; confirm: ConfirmCard | null },
): void {
  try {
    const payload: StoredSession = {
      v: 1,
      draft: input.draft,
      lines: input.lines.slice(-MAX_STORED_LINES),
      confirm: input.confirm,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey(accountId), JSON.stringify(payload));
  } catch {
    // 名单 CSV 过大时可能超出配额，草稿仍靠 draft 字段尽量保留
  }
}

export function clearAssistantSession(accountId: string): void {
  try {
    localStorage.removeItem(storageKey(accountId));
  } catch {
    /* ignore */
  }
}
