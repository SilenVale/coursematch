/**
 * 刘家铭 · M3 学生页面的接口封装。
 *
 * 不放进 `apps/web/src/api/client.ts`：那个文件是全组共用的，改动会和别人冲突。
 * 这里只包学生这条线用到的四个调用，统一带 CSRF 头并保留 error.code。
 */
import type { ActivitySummary, ActivityView, PreferenceView, TopicListView } from "@coursematch/shared";

const REQUEST_HEADER = { "X-CourseMatch-Request": "1" };

export class StudentApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StudentApiError";
    this.code = code;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string } }
    | null;

  if (!res.ok) {
    throw new StudentApiError(
      body?.error?.code ?? "INTERNAL_ERROR",
      body?.error?.message ?? res.statusText,
    );
  }
  return body!.data as T;
}

export async function fetchStudentActivities(): Promise<ActivitySummary[]> {
  const res = await fetch("/api/activities", { credentials: "include" });
  const data = await parse<{ items: ActivitySummary[] }>(res);
  return data.items;
}

export async function fetchActivity(activityId: string): Promise<ActivityView> {
  const res = await fetch(`/api/activities/${activityId}`, { credentials: "include" });
  return parse<ActivityView>(res);
}

export async function fetchTopics(activityId: string): Promise<TopicListView> {
  const res = await fetch(`/api/activities/${activityId}/topics`, {
    credentials: "include",
  });
  return parse<TopicListView>(res);
}

export async function fetchMyPreferences(activityId: string): Promise<PreferenceView> {
  const res = await fetch(`/api/activities/${activityId}/preferences/me`, {
    credentials: "include",
  });
  return parse<PreferenceView>(res);
}

export async function saveMyPreferences(
  activityId: string,
  topicIds: string[],
  expectedVersion: number,
): Promise<PreferenceView> {
  const res = await fetch(`/api/activities/${activityId}/preferences/me`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...REQUEST_HEADER },
    body: JSON.stringify({ topicIds, expectedVersion }),
  });
  return parse<PreferenceView>(res);
}
