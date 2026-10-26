import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AssistantDraft, ConfirmAction } from "./model.js";

interface ErrorBody {
  error?: {
    message?: string;
    rowErrors?: { rowNumber?: number; message?: string }[];
  };
}

interface OkBody<T> {
  data?: T;
}

function headersFrom(req: FastifyRequest): Record<string, string> {
  const webOrigin =
    process.env.WEB_ORIGIN ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:5173";
  const headers: Record<string, string> = {
    origin: webOrigin,
    "x-coursematch-request": "1",
  };
  if (typeof req.headers.cookie === "string") headers.cookie = req.headers.cookie;
  return headers;
}

async function call(
  app: FastifyInstance,
  req: FastifyRequest,
  method: "POST" | "PUT",
  url: string,
  body?: string,
  contentType = "application/json",
): Promise<{ status: number; json: unknown }> {
  const response = await app.inject({
    method,
    url,
    headers: { ...headersFrom(req), "content-type": contentType },
    payload: body,
  });
  let json: unknown = null;
  try {
    json = response.json();
  } catch {
    json = null;
  }
  return { status: response.statusCode, json };
}

function errorText(json: unknown, fallback: string): string {
  const body = json as ErrorBody;
  const rows = body.error?.rowErrors ?? [];
  const rowText = rows
    .slice(0, 5)
    .map((row) => `第 ${row.rowNumber ?? "?"} 行：${row.message ?? ""}`)
    .join("\n");
  return [body.error?.message ?? fallback, rowText].filter(Boolean).join("\n");
}

function offerTitle(instructor: string, courseName: string): string {
  return `${instructor.trim()} · ${courseName.trim()}`;
}

function offerDescription(instructor: string, schedule: string): string {
  return `授课教师：${instructor.trim()}\n上课时间：${schedule.trim()}`;
}

export async function executeAction(
  app: FastifyInstance,
  req: FastifyRequest,
  action: ConfirmAction,
  draft: AssistantDraft,
): Promise<{ draft: AssistantDraft; reply: string }> {
  if (action === "create") return executeCreate(app, req, draft);
  if (!draft.activityId) {
    return { draft, reply: "还没有选课草稿，不能做这一步。" };
  }

  if (action === "publish") {
    const result = await call(
      app,
      req,
      "POST",
      `/api/activities/${draft.activityId}/publish`,
      JSON.stringify({ expectedConfigVersion: draft.configVersion }),
    );
    if (result.status >= 400) {
      return { draft: { ...draft, pending: null }, reply: errorText(result.json, "发布失败") };
    }
    const data = (result.json as OkBody<{ configVersion: number }>).data;
    return {
      draft: {
        ...draft,
        pending: null,
        lifecycle: "PUBLISHED",
        configVersion: data?.configVersion ?? draft.configVersion,
      },
      reply: "已发布。学生现在可以填志愿。截止后可以说「冻结」。",
    };
  }

  if (action === "provision") {
    const result = await call(
      app,
      req,
      "POST",
      `/api/activities/${draft.activityId}/participants/provision-accounts`,
      "{}",
    );
    if (result.status >= 400) {
      return { draft: { ...draft, pending: null }, reply: errorText(result.json, "开通账号失败") };
    }
    const data = (result.json as OkBody<{ provisionedCount: number; identifiers: string[] }>).data;
    const ids = data?.identifiers?.join("、") || "没有新人";
    return {
      draft: { ...draft, pending: null },
      reply: `已开通 ${data?.provisionedCount ?? 0} 个账号：${ids}`,
    };
  }

  if (action === "freeze") {
    const result = await call(app, req, "POST", `/api/activities/${draft.activityId}/freeze`, "{}");
    if (result.status >= 400) {
      return { draft: { ...draft, pending: null }, reply: errorText(result.json, "冻结失败") };
    }
    return {
      draft: { ...draft, pending: null },
      reply: "已生成冻结快照。要分配的话，说「主分配」。",
    };
  }

  const result = await call(app, req, "POST", `/api/activities/${draft.activityId}/allocation`, "{}");
  if (result.status >= 400) {
    return { draft: { ...draft, pending: null }, reply: errorText(result.json, "主分配失败") };
  }
  const data = (
    result.json as OkBody<{ counts?: { assigned: number; unallocated: number; notSubmitted: number } }>
  ).data;
  const counts = data?.counts;
  return {
    draft: { ...draft, pending: null, lifecycle: "ALLOCATED" },
    reply: counts
      ? `主分配完成。已分配 ${counts.assigned}，落选 ${counts.unallocated}，未提交 ${counts.notSubmitted}。`
      : "主分配完成。",
  };
}

async function executeCreate(
  app: FastifyInstance,
  req: FastifyRequest,
  draft: AssistantDraft,
): Promise<{ draft: AssistantDraft; reply: string }> {
  let next = { ...draft, topic: { ...draft.topic }, pending: null as AssistantDraft["pending"] };

  if (!next.activityId) {
    const created = await call(
      app,
      req,
      "POST",
      "/api/activities",
      JSON.stringify({
        title: next.title,
        description: next.description,
        startAt: next.startAt,
        deadlineAt: next.deadlineAt,
        maxPreferences: next.maxPreferences ?? 3,
      }),
    );
    if (created.status >= 400) {
      return { draft: next, reply: errorText(created.json, "创建失败") };
    }
    const data = (created.json as OkBody<{ activityId: string; configVersion: number }>).data;
    next = {
      ...next,
      activityId: data?.activityId ?? null,
      configVersion: data?.configVersion ?? 0,
      lifecycle: "DRAFT",
    };
  }

  if (!next.activityId || next.configVersion === null) {
    return { draft: next, reply: "创建没有返回活动编号。" };
  }

  if (!next.rosterWritten) {
    const preview = await call(
      app,
      req,
      "POST",
      `/api/activities/${next.activityId}/participants/preview?expectedConfigVersion=${next.configVersion}`,
      next.rosterText,
      "text/csv; charset=utf-8",
    );
    if (preview.status >= 400) {
      return {
        draft: { ...next, pending: "create" },
        reply: `${errorText(preview.json, "名单预览未通过，已有名单没有改动")}\n改完名单后回复「确认」再试。`,
      };
    }
    const replaced = await call(
      app,
      req,
      "PUT",
      `/api/activities/${next.activityId}/participants?expectedConfigVersion=${next.configVersion}`,
      next.rosterText,
      "text/csv; charset=utf-8",
    );
    if (replaced.status >= 400) {
      return {
        draft: { ...next, pending: "create" },
        reply: `${errorText(replaced.json, "名单没有写入")}\n改完后回复「确认」再试。`,
      };
    }
    const data = (replaced.json as OkBody<{ configVersion: number; participantCount: number }>).data;
    next = {
      ...next,
      rosterWritten: true,
      configVersion: data?.configVersion ?? next.configVersion,
    };
  }

  if (!next.topicWritten) {
    const createdTopic = await call(
      app,
      req,
      "POST",
      `/api/activities/${next.activityId}/topics`,
      JSON.stringify({
        title: offerTitle(next.topic.instructor, next.topic.courseName),
        description: offerDescription(next.topic.instructor, next.topic.schedule),
        tags: [],
        capacity: next.topic.capacity,
        eligibilityMode: "ALL",
        eligibilityDescription: "",
        expectedConfigVersion: next.configVersion,
      }),
    );
    if (createdTopic.status >= 400) {
      return {
        draft: { ...next, pending: "create" },
        reply: `${errorText(createdTopic.json, "课程没有写入")}\n改完后回复「确认」再试。`,
      };
    }
    const data = (createdTopic.json as OkBody<{ configVersion: number }>).data;
    next = { ...next, topicWritten: true, configVersion: data?.configVersion ?? next.configVersion };
  }

  return {
    draft: next,
    reply: `草稿已创建。可以打开课程设置核对同一场选课。要让学生填报，请说「发布」。`,
  };
}
