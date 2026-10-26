import type { AssistantDraft, ChatLine, ConfirmCard } from "./assistantSessionStorage";

export interface StoredAssistantSession {
  v: 1;
  draft: AssistantDraft | null;
  lines: ChatLine[];
  confirm: ConfirmCard | null;
}

async function parseJson<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { data?: T; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? "请求失败");
  return json.data as T;
}

export async function fetchTeacherAssistantSession(): Promise<StoredAssistantSession | null> {
  const res = await fetch("/api/assistant/session", {
    credentials: "include",
    headers: { "X-CourseMatch-Request": "1" },
  });
  if (res.status === 401) return null;
  const data = await parseJson<StoredAssistantSession | null>(res);
  if (!data || data.v !== 1 || !Array.isArray(data.lines) || data.lines.length === 0) return null;
  return data;
}

export async function saveTeacherAssistantSession(payload: StoredAssistantSession): Promise<void> {
  const res = await fetch("/api/assistant/session", {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CourseMatch-Request": "1",
    },
    body: JSON.stringify({ ...payload, v: 1 as const }),
  });
  await parseJson(res);
}

export async function clearTeacherAssistantSession(): Promise<void> {
  const res = await fetch("/api/assistant/session", {
    method: "DELETE",
    credentials: "include",
    headers: { "X-CourseMatch-Request": "1" },
  });
  await parseJson(res);
}
