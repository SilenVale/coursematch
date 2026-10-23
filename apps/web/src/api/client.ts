import type { ActorView, ActivitySummary, BusinessApiFailure } from "@coursematch/shared";

const JSON_HEADER = { "Content-Type": "application/json" };
const REQUEST_HEADER = { "X-CourseMatch-Request": "1" };

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    const err = body as BusinessApiFailure;
    throw new Error(err.error?.message ?? res.statusText);
  }
  return body as T;
}

export async function apiLogin(identifier: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { ...JSON_HEADER, ...REQUEST_HEADER },
    body: JSON.stringify({ identifier, password }),
  });
  const json = await parse<{ data: ActorView }>(res);
  return json.data;
}

export async function apiMe(): Promise<ActorView | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  const json = await parse<{ data: ActorView }>(res);
  return json.data;
}

export async function apiLogout() {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: REQUEST_HEADER,
  });
}

export async function apiActivities() {
  const list = await fetch("/api/activities", { credentials: "include" });
  // 返回类型按契约用完整的 ActivitySummary：调用方需要 phase / startAt / deadlineAt，
  // 之前只声明了三个字段，导致教师冻结页与 M4 的页面编译不过。
  return parse<{ data: { items: ActivitySummary[] } }>(list);
}
