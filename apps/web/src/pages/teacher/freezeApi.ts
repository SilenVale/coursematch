import type {
  AllocationView,
  CloseView,
  EvidenceView,
  FreezeView,
  TeacherResultsView,
} from "@coursematch/shared";

const JSON_HEADER = { "Content-Type": "application/json" };
const REQUEST_HEADER = { "X-CourseMatch-Request": "1" };

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    const err = body as { error?: { message?: string } };
    throw new Error(err.error?.message ?? res.statusText);
  }
  return body as T;
}

function headers() {
  return { ...JSON_HEADER, ...REQUEST_HEADER };
}

export async function apiFreezeGet(activityId: string) {
  const res = await fetch(`/api/activities/${activityId}/freeze`, { credentials: "include" });
  const json = await parse<{ data: FreezeView }>(res);
  return json.data;
}

export async function apiFreezePost(activityId: string) {
  const res = await fetch(`/api/activities/${activityId}/freeze`, {
    method: "POST",
    credentials: "include",
    headers: headers(),
  });
  const json = await parse<{ data: FreezeView }>(res);
  return json.data;
}

export async function apiAllocate(activityId: string) {
  const res = await fetch(`/api/activities/${activityId}/allocation`, {
    method: "POST",
    credentials: "include",
    headers: headers(),
  });
  const json = await parse<{ data: AllocationView }>(res);
  return json.data;
}

export async function apiTeacherResults(activityId: string) {
  const res = await fetch(`/api/activities/${activityId}/results`, { credentials: "include" });
  const json = await parse<{ data: TeacherResultsView }>(res);
  return json.data;
}

export async function apiEvidence(activityId: string) {
  const res = await fetch(`/api/activities/${activityId}/evidence`, { credentials: "include" });
  const json = await parse<{ data: EvidenceView }>(res);
  return json.data;
}

export async function apiClose(activityId: string, reason: string) {
  const res = await fetch(`/api/activities/${activityId}/close`, {
    method: "POST",
    credentials: "include",
    headers: headers(),
    body: JSON.stringify({ reason }),
  });
  const json = await parse<{ data: CloseView }>(res);
  return json.data;
}
