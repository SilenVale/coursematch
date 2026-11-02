const JSON_HEADERS = {
  "Content-Type": "application/json",
  "X-CourseMatch-Request": "1",
};

async function parseJson(res: Response) {
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (json as { error?: { message?: string } })?.error?.message ?? res.statusText;
    throw new Error(msg);
  }
  return (json as { data: unknown }).data;
}

export async function fetchDevToolsEnabled(): Promise<boolean> {
  const res = await fetch("/api/meta/features", { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok) return false;
  return Boolean((json as { data?: { devTools?: boolean } })?.data?.devTools);
}

export async function fetchTrialPreview(activityId: string): Promise<{
  participantCount: number;
  accountReadyCount: number;
  topicCount: number;
}> {
  const res = await fetch(`/api/activities/${activityId}/dev/trial-preview`, {
    credentials: "include",
  });
  return parseJson(res) as Promise<{
    participantCount: number;
    accountReadyCount: number;
    topicCount: number;
  }>;
}

export type SimulateStrategy = "same_first" | "round_robin" | "random";

export async function postSimulatePreferences(
  activityId: string,
  body: { strategy: SimulateStrategy; skipUnfilledCount: number },
) {
  const res = await fetch(`/api/activities/${activityId}/dev/simulate-preferences`, {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function postResetTrial(activityId: string) {
  const res = await fetch(`/api/activities/${activityId}/dev/reset-trial`, {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: "{}",
  });
  return parseJson(res);
}

export async function postReachDeadline(activityId: string) {
  const res = await fetch(`/api/activities/${activityId}/dev/reach-deadline`, {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: "{}",
  });
  return parseJson(res);
}

export async function postRunAllocationTrial(
  activityId: string,
  body: {
    simulate: boolean;
    deadline: boolean;
    freeze: boolean;
    allocate: boolean;
    strategy: SimulateStrategy;
    skipUnfilledCount: number;
  },
) {
  const res = await fetch(`/api/activities/${activityId}/dev/run-allocation-trial`, {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (json as { error?: { message?: string } })?.error?.message ?? res.statusText;
    const err = new Error(msg) as Error & { steps?: unknown[] };
    err.steps = (json as { data?: { steps?: unknown[] } })?.data?.steps;
    throw err;
  }
  return (json as { data: unknown }).data;
}
