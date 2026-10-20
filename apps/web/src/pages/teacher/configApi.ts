/**
 * 石俊贤 · M2 教师端请求层。
 *
 * 为什么不直接改 `apps/web/src/api/client.ts`：那是 M1 共同底座的文件，
 * 不在 M2 允许改动范围内。这里只补 M2 需要的接口，并沿用同一套
 * 会话 Cookie + CSRF 头约定（见 apps/api/src/plugins/csrf.ts）。
 */
import type {
  ActivityDraftInput,
  ActivityPatchInput,
  ActivitySummary,
  ActivityView,
  FieldError,
  ParticipantQuery,
  ParticipantView,
  RosterPreview,
  RosterReplacedView,
  RowError,
  TeacherTopicView,
  TopicCreateInput,
  TopicListView,
  TopicPatchInput,
  VoidView,
} from "@coursematch/shared";

const REQUEST_HEADER = { "X-CourseMatch-Request": "1" };
const JSON_HEADERS = { "Content-Type": "application/json", ...REQUEST_HEADER };

/** 业务错误：保留 code / fieldErrors / rowErrors，页面据此做精确提示。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldError[];
  readonly rowErrors: RowError[];

  constructor(params: {
    status: number;
    code: string;
    message: string;
    fieldErrors?: FieldError[];
    rowErrors?: RowError[];
  }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.fieldErrors = params.fieldErrors ?? [];
    this.rowErrors = params.rowErrors ?? [];
  }

  /** 501 = 模块尚未实现（例如题目、发布由后续批次补上）。 */
  get notImplemented(): boolean {
    return this.status === 501;
  }
}

interface FailureBody {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: FieldError[];
    rowErrors?: RowError[];
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const failure = (body ?? {}) as FailureBody;
    throw new ApiError({
      status: res.status,
      code: failure.error?.code ?? "INTERNAL_ERROR",
      message: failure.error?.message ?? `请求失败（HTTP ${res.status}）`,
      fieldErrors: failure.error?.fieldErrors,
      rowErrors: failure.error?.rowErrors,
    });
  }

  return (body as { data: T }).data;
}

function toQuery(query: ParticipantQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

// ------------------------------------------------------------------ 活动

export function listActivities(): Promise<{ items: ActivitySummary[] }> {
  return request("/api/activities");
}

export function getActivity(activityId: string): Promise<ActivityView> {
  return request(`/api/activities/${activityId}`);
}

export function createActivity(input: ActivityDraftInput): Promise<ActivityView> {
  return request("/api/activities", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

/**
 * 契约里 `ActivityPatchInput` 是「至少一个字段」的联合类型，运行时无法从
 * 动态构造的对象里向编译器证明这一点。调用方保证至少传一个字段，
 * 服务端（config.ts）也会再校验一次「没有需要修改的字段」。
 */
export type ActivityPatchPayload = Partial<ActivityDraftInput> & {
  expectedConfigVersion: number;
};

export function patchActivity(
  activityId: string,
  input: ActivityPatchPayload,
): Promise<ActivityView> {
  return request(`/api/activities/${activityId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input as ActivityPatchInput),
  });
}

export function voidActivity(activityId: string, reason: string): Promise<VoidView> {
  return request(`/api/activities/${activityId}/void`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ reason }),
  });
}

// ------------------------------------------------------------------ 名单

export function listParticipants(
  activityId: string,
  query: ParticipantQuery = {},
): Promise<{ items: ParticipantView[] }> {
  return request(`/api/activities/${activityId}/participants${toQuery(query)}`);
}

/** 预览只读，不落库；失败时抛 ApiError 且 rowErrors 里带逐行原因。 */
export function previewRoster(
  activityId: string,
  csvText: string,
  expectedConfigVersion: number,
): Promise<RosterPreview> {
  return request(
    `/api/activities/${activityId}/participants/preview?expectedConfigVersion=${expectedConfigVersion}`,
    {
      method: "POST",
      headers: { "Content-Type": "text/csv; charset=utf-8", ...REQUEST_HEADER },
      body: csvText,
    },
  );
}

/** 整份替换；服务端在事务里做，失败不会破坏已生效名单。 */
export function replaceRoster(
  activityId: string,
  csvText: string,
  expectedConfigVersion: number,
): Promise<RosterReplacedView> {
  return request(
    `/api/activities/${activityId}/participants?expectedConfigVersion=${expectedConfigVersion}`,
    {
      method: "PUT",
      headers: { "Content-Type": "text/csv; charset=utf-8", ...REQUEST_HEADER },
      body: csvText,
    },
  );
}

// ------------------------------------------------------------------ 题目（第二批）

export function listTopics(
  activityId: string,
  query: { q?: string; tag?: string } = {},
): Promise<TopicListView> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.tag) params.set("tag", query.tag);
  const text = params.toString();
  return request(`/api/activities/${activityId}/topics${text ? `?${text}` : ""}`);
}

export function createTopic(
  activityId: string,
  input: TopicCreateInput,
): Promise<{ topic: TeacherTopicView; configVersion: number }> {
  return request(`/api/activities/${activityId}/topics`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function patchTopic(
  activityId: string,
  topicId: string,
  input: TopicPatchInput,
): Promise<{ topic: TeacherTopicView; configVersion: number }> {
  return request(`/api/activities/${activityId}/topics/${topicId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function deleteTopic(
  activityId: string,
  topicId: string,
  expectedConfigVersion: number,
): Promise<{ configVersion: number }> {
  return request(`/api/activities/${activityId}/topics/${topicId}`, {
    method: "DELETE",
    headers: JSON_HEADERS,
    body: JSON.stringify({ expectedConfigVersion }),
  });
}

export function publishActivity(
  activityId: string,
  expectedConfigVersion: number,
): Promise<ActivityView> {
  return request(`/api/activities/${activityId}/publish`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ expectedConfigVersion }),
  });
}
