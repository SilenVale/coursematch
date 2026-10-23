/**
 * 石俊贤 · M2 活动与资格配置。
 *
 * 本批实现（第 1 批，不依赖 topic 表）：
 *   POST   /api/activities                       创建草稿
 *   PATCH  /api/activities/:activityId           编辑基本信息（乐观锁）
 *   GET    /api/activities/:activityId/participants   名单查询（含筛选）
 *   POST   /api/activities/:activityId/participants/preview  只预览不写库
 *   PUT    /api/activities/:activityId/participants           整份替换
 *   POST   /api/activities/:activityId/void      作废（需迁移补 void_at / void_reason）
 *
 * 题目 CRUD 与 publish 依赖 topic 表，等迁移落地后在本文件继续追加。
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type {
  ActivityDraftInput,
  ActivityPatchInput,
  ActivityView,
  ConfirmedIdentity,
  ConfigVersionInput,
  FieldError,
  Lifecycle,
  ParticipantView,
  RosterReplacedView,
  StudentTopicView,
  TopicCreateInput,
  TopicPatchInput,
  VoidView,
} from "@coursematch/shared";
import { pool } from "../../db/pool.js";
import { provisionAccountsForActivity } from "../../lib/provision-student-accounts.js";
import { fail, ok } from "../../lib/response.js";
import {
  buildRosterPreview,
  detectProfileConflicts,
  fieldError,
  parseRoster,
} from "./config-roster.js";
import {
  TOPIC_FIELD_COLUMNS,
  toStudentTopicView,
  toTeacherTopicView,
  validateEligibility,
  validateTopicCreate,
  validateTopicFields,
  type TopicRow,
} from "./config-topics.js";
import {
  loadEligibleParticipantIds,
  loadTopic,
  publishBlockers,
  requireDraft,
  validateEligibleIds,
} from "./config-topics-db.js";

/** 可编辑的字段 → 数据库列名。 */
const ACTIVITY_FIELD_COLUMNS = {
  title: "title",
  description: "description",
  startAt: "start_at",
  deadlineAt: "deadline_at",
  maxPreferences: "max_preferences",
} as const;

type ActivityField = keyof typeof ACTIVITY_FIELD_COLUMNS;

/** 发布后仍然允许修改的字段：只有简介不影响公平性。 */
const POST_PUBLISH_EDITABLE: ReadonlySet<ActivityField> = new Set<ActivityField>([
  "description",
]);

const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  ALLOCATED: "已分配",
  CLOSED: "已关闭",
  VOID: "已作废",
};

interface ActivityRow {
  id: string;
  owner_account_id: string;
  title: string;
  description: string;
  start_at: Date;
  deadline_at: Date;
  max_preferences: number;
  rule_version: string;
  lifecycle: Lifecycle;
  config_version: number;
  published_at: Date | null;
}

/**
 * 读活动并校验归属。
 *
 * 不是本人活动时一律返回 404 而不是 403：不透露活动是否存在（ARCHITECTURE §接口）。
 * 返回值 `null` 表示已经向 reply 写入错误，调用方直接 return。
 */
async function loadOwnedActivity(
  req: FastifyRequest,
  reply: FastifyReply,
  activityId: string,
  options: { forUpdate?: boolean } = {},
): Promise<ActivityRow | null> {
  const client = options.forUpdate ? await pool.connect() : null;
  try {
    const { rows } = await (client ?? pool).query<ActivityRow>(
      `SELECT * FROM activity WHERE id = $1${options.forUpdate ? " FOR UPDATE" : ""}`,
      [activityId],
    );
    const row = rows[0];
    if (!row || row.owner_account_id !== req.actor?.accountId) {
      const { status, body } = fail("RESOURCE_NOT_FOUND", "活动不存在", 404);
      reply.code(status).send(body);
      return null;
    }
    return row;
  } finally {
    client?.release();
  }
}

/** 乐观锁：传入的 expectedConfigVersion 必须等于当前值。 */
function checkConfigVersion(
  row: ActivityRow,
  expected: unknown,
  reply: FastifyReply,
): boolean {
  if (typeof expected !== "number" || !Number.isInteger(expected)) {
    const { status, body } = fail("INVALID_INPUT", "expectedConfigVersion 必须是整数", 400, {
      fieldErrors: [
        fieldError("expectedConfigVersion", "INVALID_FORMAT", "expectedConfigVersion 必须是整数"),
      ],
    });
    reply.code(status).send(body);
    return false;
  }
  if (expected !== row.config_version) {
    const { status, body } = fail(
      "VERSION_CONFLICT",
      `配置已被修改（当前版本 ${row.config_version}，你提交的是 ${expected}），请刷新后重试`,
      409,
    );
    reply.code(status).send(body);
    return false;
  }
  return true;
}

/** 校验活动生命周期是否允许编辑配置。 */
function requireEditableLifecycle(row: ActivityRow, reply: FastifyReply): boolean {
  if (row.lifecycle === "VOID" || row.lifecycle === "CLOSED") {
    const { status, body } = fail(
      row.lifecycle === "VOID" ? "ACTIVITY_VOID" : "ACTIVITY_CLOSED",
      `活动已${LIFECYCLE_LABEL[row.lifecycle]}，不能再修改`,
      409,
    );
    reply.code(status).send(body);
    return false;
  }
  return true;
}

/** 与 read.ts 保持一致的视图映射（读接口由底座负责，这里只用于写接口回包）。 */
function toActivityView(row: ActivityRow): ActivityView {
  const now = new Date();
  let phase: ActivityView["phase"];
  if (row.lifecycle === "VOID") phase = "VOID";
  else if (row.lifecycle === "CLOSED") phase = "CLOSED";
  else if (row.lifecycle === "DRAFT") phase = "DRAFT";
  else if (now < row.start_at) phase = "NOT_STARTED";
  else if (now < row.deadline_at) phase = "FILLING";
  else if (row.lifecycle === "PUBLISHED") phase = "DEADLINE_REACHED";
  else if (row.lifecycle === "ALLOCATED") phase = "ALLOCATED";
  else phase = "DRAFT";

  return {
    activityId: row.id,
    title: row.title,
    lifecycle: row.lifecycle,
    phase,
    startAt: row.start_at.toISOString(),
    deadlineAt: row.deadline_at.toISOString(),
    description: row.description,
    maxPreferences: row.max_preferences,
    ruleVersion: row.rule_version,
    configVersion: row.config_version,
    freezePreparation: "PENDING",
    resultPreparation: "PENDING",
    allowedActions: allowedActions(row),
  };
}

/**
 * 由服务端推导可用操作，前端只按它渲染按钮。
 * 这是对底座 `read.ts` 里 `allowedActions: []` 的补充，等负责人统一后可去掉。
 */
function allowedActions(row: ActivityRow): ActivityView["allowedActions"] {
  const actions: ActivityView["allowedActions"] = [];
  if (row.lifecycle === "DRAFT") {
    actions.push(
      "UPDATE_ACTIVITY",
      "REPLACE_ROSTER",
      "CREATE_TOPIC",
      "UPDATE_TOPIC",
      "DELETE_TOPIC",
      "PUBLISH_ACTIVITY",
    );
  } else if (row.lifecycle === "PUBLISHED") {
    actions.push("UPDATE_DESCRIPTION", "VOID_ACTIVITY");
  }
  return actions;
}

/** 校验草稿创建/编辑的时间与志愿数，返回字段错误。 */
function validateDraftFields(input: Partial<ActivityDraftInput>): {
  fieldErrors: ReturnType<typeof fieldError>[];
  values: Partial<ActivityDraftInput>;
} {
  const fieldErrors: ReturnType<typeof fieldError>[] = [];
  const values: Partial<ActivityDraftInput> = {};

  if (input.title !== undefined) {
    const title = String(input.title).trim();
    if (title.length === 0) {
      fieldErrors.push(fieldError("title", "REQUIRED", "活动名称不能为空"));
    } else if (title.length > 120) {
      fieldErrors.push(fieldError("title", "TOO_LONG", "活动名称最多 120 个字符"));
    } else {
      values.title = title;
    }
  }

  if (input.description !== undefined) {
    const description = String(input.description);
    if (description.length > 2000) {
      fieldErrors.push(fieldError("description", "TOO_LONG", "活动说明最多 2000 个字符"));
    } else {
      values.description = description;
    }
  }

  if (input.maxPreferences !== undefined) {
    const n = Number(input.maxPreferences);
    if (!Number.isInteger(n) || n < 1 || n > 3) {
      fieldErrors.push(
        fieldError("maxPreferences", "OUT_OF_RANGE", "最大志愿数必须是 1～3 的整数"),
      );
    } else {
      values.maxPreferences = n;
    }
  }

  for (const key of ["startAt", "deadlineAt"] as const) {
    const raw = input[key];
    if (raw === undefined) continue;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      fieldErrors.push(fieldError(key, "INVALID_FORMAT", `${key} 不是合法的 ISO 时间`));
    } else {
      values[key] = parsed.toISOString();
    }
  }

  return { fieldErrors, values };
}

/** 名单上传的两种通道：multipart 的 `file` 字段，或裸 CSV 文本。 */
interface RosterPayload {
  text: string;
  expectedConfigVersion: number | undefined;
}

async function readRosterPayload(req: FastifyRequest): Promise<
  { ok: true; payload: RosterPayload } | { ok: false; status: number; body: unknown }
> {
  const contentType = String(req.headers["content-type"] ?? "");
  const query = (req.query ?? {}) as { expectedConfigVersion?: string };

  // 通道 A：multipart/form-data（需要 @fastify/multipart，尚未加入依赖）
  if (contentType.includes("multipart/form-data")) {
    if (typeof (req as { file?: unknown }).file !== "function") {
      const { status, body } = fail(
        "SERVICE_UNAVAILABLE",
        "服务端未启用 multipart 解析，请以 text/csv 直接提交文件内容",
        503,
      );
      return { ok: false, status, body };
    }
    const part = await (
      req as unknown as { file: () => Promise<{ toBuffer: () => Promise<Buffer>; fields: Record<string, unknown> } | undefined> }
    ).file();
    if (!part) {
      const { status, body } = fail("INVALID_INPUT", "缺少文件字段 file", 400, {
        fieldErrors: [fieldError("file", "REQUIRED", "缺少文件字段 file")],
      });
      return { ok: false, status, body };
    }
    const buffer = await part.toBuffer();
    const versionField = part.fields?.expectedConfigVersion as
      | { value?: unknown }
      | undefined;
    return {
      ok: true,
      payload: {
        text: buffer.toString("utf8"),
        expectedConfigVersion:
          versionField?.value !== undefined
            ? Number(versionField.value)
            : query.expectedConfigVersion !== undefined
              ? Number(query.expectedConfigVersion)
              : undefined,
      },
    };
  }

  // 通道 B：裸 CSV 文本
  if (!contentType.includes("csv") && !contentType.includes("text/plain")) {
    const { status, body } = fail(
      "UNSUPPORTED_MEDIA_TYPE",
      "名单请使用 text/csv（或 multipart/form-data）提交",
      415,
    );
    return { ok: false, status, body };
  }

  const raw = req.body;
  const text =
    typeof raw === "string"
      ? raw
      : raw === undefined || raw === null
        ? ""
        : String(raw);

  return {
    ok: true,
    payload: {
      text,
      expectedConfigVersion:
        query.expectedConfigVersion !== undefined
          ? Number(query.expectedConfigVersion)
          : undefined,
    },
  };
}

/** 读该活动当前名单（含档案五列）。 */
async function loadCurrentRoster(activityId: string): Promise<ConfirmedIdentity[]> {
  const { rows } = await pool.query<{
    student_number: string;
    name: string;
    enrollment_year: string;
    major: string;
    class_name: string;
  }>(
    `SELECT sp.student_number, sp.name, sp.enrollment_year, sp.major, sp.class_name
     FROM participant p
     JOIN student_profile sp ON sp.id = p.student_profile_id
     WHERE p.activity_id = $1
     ORDER BY sp.student_number`,
    [activityId],
  );
  return rows.map((r) => ({
    studentNumber: r.student_number,
    name: r.name,
    enrollmentYear: r.enrollment_year,
    major: r.major,
    className: r.class_name,
  }));
}

/** 解析失败统一回 IMPORT_INVALID。 */
function sendRowErrors(reply: FastifyReply, rowErrors: unknown[]) {
  const { status, body } = fail(
    "IMPORT_INVALID",
    `名单校验未通过，共 ${rowErrors.length} 处问题；已生效名单未被修改`,
    400,
    { rowErrors },
  );
  return reply.code(status).send(body);
}



export const activityConfigRoutes: FastifyPluginAsync = async (app) => {
  // 名单走裸 CSV 文本。Fastify 默认只认 application/json，
  // 不注册这个 parser 的话请求会在进入 handler 之前就被 415 拒掉。
  app.addContentTypeParser(
    ["text/csv", "text/plain"],
    { parseAs: "string" },
    (_req, body, done) => done(null, body),
  );

  // ---------------------------------------------------------------- 创建草稿
  app.post<{ Body: ActivityDraftInput }>("/api/activities", async (req, reply) => {
    const input = (req.body ?? {}) as Partial<ActivityDraftInput>;
    const { fieldErrors, values } = validateDraftFields(input);

    if (
      values.title === undefined ||
      values.description === undefined ||
      values.startAt === undefined ||
      values.deadlineAt === undefined ||
      values.maxPreferences === undefined
    ) {
      const missing = (
        ["title", "description", "startAt", "deadlineAt", "maxPreferences"] as const
      )
        .filter((k) => values[k] === undefined && !fieldErrors.some((e) => e.field === k))
        .map((k) => fieldError(k, "REQUIRED", `${k} 为必填`));
      const all = [...fieldErrors, ...missing];
      const { status, body } = fail("INVALID_INPUT", "活动信息不完整", 400, {
        fieldErrors: all,
      });
      return reply.code(status).send(body);
    }

    if (fieldErrors.length > 0) {
      const { status, body } = fail("INVALID_INPUT", "活动信息有误", 400, { fieldErrors });
      return reply.code(status).send(body);
    }

    if (values.startAt >= values.deadlineAt) {
      const { status, body } = fail("INVALID_INPUT", "截止时间必须晚于开始时间", 400, {
        fieldErrors: [
          fieldError("deadlineAt", "OUT_OF_RANGE", "截止时间必须晚于开始时间"),
        ],
      });
      return reply.code(status).send(body);
    }

    const { rows } = await pool.query<ActivityRow>(
      `INSERT INTO activity (
         id, owner_account_id, title, description, start_at, deadline_at,
         max_preferences, lifecycle, config_version
       ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'DRAFT', 0)
       RETURNING *`,
      [
        req.actor!.accountId,
        values.title,
        values.description,
        values.startAt,
        values.deadlineAt,
        values.maxPreferences,
      ],
    );

    return ok(toActivityView(rows[0]));
  });

  // ---------------------------------------------------------------- 编辑基本信息
  app.patch<{ Params: { activityId: string }; Body: ActivityPatchInput }>(
    "/api/activities/:activityId",
    async (req, reply) => {
      const { activityId } = req.params;
      const row = await loadOwnedActivity(req, reply, activityId);
      if (!row) return reply;

      if (!requireEditableLifecycle(row, reply)) return reply;

      const input = (req.body ?? {}) as Partial<ActivityPatchInput>;
      const editableKeys = (Object.keys(ACTIVITY_FIELD_COLUMNS) as ActivityField[]).filter(
        (k) => input[k] !== undefined,
      );
      if (editableKeys.length === 0) {
        const { status, body } = fail("INVALID_INPUT", "没有需要修改的字段", 400);
        return reply.code(status).send(body);
      }

      if (!checkConfigVersion(row, input.expectedConfigVersion, reply)) return reply;

      if (row.lifecycle !== "DRAFT") {
        const locked = editableKeys.filter((k) => !POST_PUBLISH_EDITABLE.has(k));
        if (locked.length > 0) {
          const { status, body } = fail(
            "CONFIG_LOCKED",
            `活动已发布，以下字段不允许再修改：${locked.join("、")}`,
            409,
            {
              fieldErrors: locked.map((k) =>
                fieldError(k, "CONFIG_LOCKED", "活动已发布，该字段不允许修改"),
              ),
            },
          );
          return reply.code(status).send(body);
        }
      }

      const { fieldErrors, values } = validateDraftFields(input);
      if (fieldErrors.length > 0) {
        const { status, body } = fail("INVALID_INPUT", "活动信息有误", 400, {
          fieldErrors,
        });
        return reply.code(status).send(body);
      }

      const nextStart = values.startAt ?? row.start_at.toISOString();
      const nextDeadline = values.deadlineAt ?? row.deadline_at.toISOString();
      if (nextStart >= nextDeadline) {
        const { status, body } = fail("INVALID_INPUT", "截止时间必须晚于开始时间", 400, {
          fieldErrors: [
            fieldError("deadlineAt", "OUT_OF_RANGE", "截止时间必须晚于开始时间"),
          ],
        });
        return reply.code(status).send(body);
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      for (const key of editableKeys) {
        if (values[key] === undefined) continue;
        params.push(values[key]);
        sets.push(`${ACTIVITY_FIELD_COLUMNS[key]} = $${params.length}`);
      }
      params.push(activityId);

      const { rows } = await pool.query<ActivityRow>(
        `UPDATE activity
         SET ${sets.join(", ")}, config_version = config_version + 1
         WHERE id = $${params.length}
         RETURNING *`,
        params,
      );

      return ok(toActivityView(rows[0]));
    },
  );

  // ---------------------------------------------------------------- 名单查询
  app.get<{
    Params: { activityId: string };
    Querystring: { q?: string; enrollmentYear?: string; major?: string; className?: string };
  }>("/api/activities/:activityId/participants", async (req, reply) => {
    const row = await loadOwnedActivity(req, reply, req.params.activityId);
    if (!row) return reply;

    const { q, enrollmentYear, major, className } = req.query ?? {};
    const conditions = ["p.activity_id = $1"];
    const params: unknown[] = [row.id];

    if (q && q.trim() !== "") {
      params.push(`%${q.trim()}%`);
      const i = params.length;
      conditions.push(`(sp.student_number ILIKE $${i} OR sp.name ILIKE $${i})`);
    }
    if (enrollmentYear) {
      params.push(enrollmentYear);
      conditions.push(`sp.enrollment_year = $${params.length}`);
    }
    if (major) {
      params.push(major);
      conditions.push(`sp.major = $${params.length}`);
    }
    if (className) {
      params.push(className);
      conditions.push(`sp.class_name = $${params.length}`);
    }

    const { rows } = await pool.query<{
      id: string;
      eligible: boolean;
      student_number: string;
      name: string;
      enrollment_year: string;
      major: string;
      class_name: string;
      account_configured: boolean;
    }>(
      `SELECT p.id, p.eligible, sp.student_number, sp.name, sp.enrollment_year,
              sp.major, sp.class_name, (acc.id IS NOT NULL) AS account_configured
       FROM participant p
       JOIN student_profile sp ON sp.id = p.student_profile_id
       LEFT JOIN account acc ON acc.student_profile_id = sp.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY sp.student_number`,
      params,
    );

    const items: ParticipantView[] = rows.map((r) => ({
      participantId: r.id,
      studentNumber: r.student_number,
      name: r.name,
      enrollmentYear: r.enrollment_year,
      major: r.major,
      className: r.class_name,
      eligible: r.eligible,
      accountConfigured: r.account_configured,
    }));

    return ok({ items });
  });

  app.post<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/participants/provision-accounts",
    async (req, reply) => {
      if (req.actor?.role !== "TEACHER") {
        const { status, body } = fail("ROLE_FORBIDDEN", "仅教师可操作", 403);
        return reply.code(status).send(body);
      }
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return reply;

      const result = await provisionAccountsForActivity(pool, row.id);
      return ok({
        provisionedCount: result.provisionedCount,
        identifiers: result.identifiers,
        defaultPasswordHint: "Coursematch-Dev-2026",
      });
    },
  );

  // ---------------------------------------------------------------- 名单预览
  app.post<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/participants/preview",
    async (req, reply) => {
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return reply;
      if (!requireEditableLifecycle(row, reply)) return reply;

      const read = await readRosterPayload(req);
      if (!read.ok) return reply.code(read.status).send(read.body);

      if (
        typeof read.payload.expectedConfigVersion !== "number" ||
        !Number.isInteger(read.payload.expectedConfigVersion)
      ) {
        const { status, body } = fail(
          "INVALID_INPUT",
          "缺少 expectedConfigVersion（可放在查询串）",
          400,
          {
            fieldErrors: [
              fieldError(
                "expectedConfigVersion",
                "REQUIRED",
                "缺少 expectedConfigVersion",
              ),
            ],
          },
        );
        return reply.code(status).send(body);
      }
      if (!checkConfigVersion(row, read.payload.expectedConfigVersion, reply)) return reply;

      const parsed = parseRoster(read.payload.text);
      if (!parsed.ok) return sendRowErrors(reply, parsed.rowErrors);

      const existing = await loadCurrentRoster(row.id);
      const existingNumbers = new Set(existing.map((p) => p.studentNumber));
      const relevant = parsed.rows.filter((r) => existingNumbers.has(r.studentNumber));

      const { rows: profiles } = await pool.query<{
        student_number: string;
        name: string;
        enrollment_year: string;
        major: string;
        class_name: string;
      }>(
        `SELECT student_number, name, enrollment_year, major, class_name
         FROM student_profile WHERE student_number = ANY($1::text[])`,
        [relevant.map((r) => r.studentNumber)],
      );

      const conflicts = detectProfileConflicts(
        relevant,
        profiles.map((p) => ({
          studentNumber: p.student_number,
          name: p.name,
          enrollmentYear: p.enrollment_year,
          major: p.major,
          className: p.class_name,
        })),
      );
      if (conflicts.length > 0) return sendRowErrors(reply, conflicts);

      return ok(
        buildRosterPreview({
          configVersion: row.config_version,
          existing,
          incoming: parsed.rows,
        }),
      );
    },
  );

  // ---------------------------------------------------------------- 名单整份替换
  app.put<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/participants",
    async (req, reply) => {
      const read = await readRosterPayload(req);
      if (!read.ok) return reply.code(read.status).send(read.body);

      if (
        typeof read.payload.expectedConfigVersion !== "number" ||
        !Number.isInteger(read.payload.expectedConfigVersion)
      ) {
        const { status, body } = fail(
          "INVALID_INPUT",
          "缺少 expectedConfigVersion（可放在查询串）",
          400,
          {
            fieldErrors: [
              fieldError(
                "expectedConfigVersion",
                "REQUIRED",
                "缺少 expectedConfigVersion",
              ),
            ],
          },
        );
        return reply.code(status).send(body);
      }

      // 先做纯校验，失败直接返回，不开启事务、不触碰任何数据。
      const parsed = parseRoster(read.payload.text);
      if (!parsed.ok) return sendRowErrors(reply, parsed.rowErrors);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 锁住活动行，避免并发替换互相覆盖版本号。
        const { rows: activityRows } = await client.query<ActivityRow>(
          `SELECT * FROM activity WHERE id = $1 FOR UPDATE`,
          [req.params.activityId],
        );
        const activity = activityRows[0];
        if (!activity || activity.owner_account_id !== req.actor?.accountId) {
          await client.query("ROLLBACK");
          const { status, body } = fail("RESOURCE_NOT_FOUND", "活动不存在", 404);
          return reply.code(status).send(body);
        }
        if (activity.lifecycle !== "DRAFT") {
          await client.query("ROLLBACK");
          const { status, body } = fail(
            "CONFIG_LOCKED",
            "名单只能在草稿状态替换",
            409,
          );
          return reply.code(status).send(body);
        }
        if (activity.config_version !== read.payload.expectedConfigVersion) {
          await client.query("ROLLBACK");
          const { status, body } = fail(
            "VERSION_CONFLICT",
            `配置已被修改（当前版本 ${activity.config_version}，你提交的是 ${read.payload.expectedConfigVersion}），请刷新后重试`,
            409,
          );
          return reply.code(status).send(body);
        }

        // 已有档案若与本次五列信息冲突，整份拒绝，不静默改别人的档案。
        const { rows: existingProfiles } = await client.query<{
          student_number: string;
          name: string;
          enrollment_year: string;
          major: string;
          class_name: string;
        }>(
          `SELECT student_number, name, enrollment_year, major, class_name
           FROM student_profile WHERE student_number = ANY($1::text[])`,
          [parsed.rows.map((r) => r.studentNumber)],
        );
        const conflicts = detectProfileConflicts(
          parsed.rows,
          existingProfiles.map((p) => ({
            studentNumber: p.student_number,
            name: p.name,
            enrollmentYear: p.enrollment_year,
            major: p.major,
            className: p.class_name,
          })),
        );
        if (conflicts.length > 0) {
          await client.query("ROLLBACK");
          return sendRowErrors(reply, conflicts);
        }

        // 1) 新学号建档案；已存在的不动。
        const existingNumbers = new Set(existingProfiles.map((p) => p.student_number));
        for (const r of parsed.rows) {
          if (existingNumbers.has(r.studentNumber)) continue;
          await client.query(
            `INSERT INTO student_profile (id, student_number, name, enrollment_year, major, class_name)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
            [r.studentNumber, r.name, r.enrollmentYear, r.major, r.className],
          );
        }

        // 2) 整份替换：先清空该活动名单，再按文件顺序插入。
        await client.query(`DELETE FROM participant WHERE activity_id = $1`, [activity.id]);
        await client.query(
          `INSERT INTO participant (id, activity_id, student_profile_id, eligible)
           SELECT gen_random_uuid(), $1, sp.id, TRUE
           FROM unnest($2::text[]) WITH ORDINALITY AS t(student_number, ord)
           JOIN student_profile sp ON sp.student_number = t.student_number
           ORDER BY t.ord`,
          [activity.id, parsed.rows.map((r) => r.studentNumber)],
        );

        const { rows: updated } = await client.query<{ config_version: number }>(
          `UPDATE activity SET config_version = config_version + 1
           WHERE id = $1 RETURNING config_version`,
          [activity.id],
        );

        const { rows: countRows } = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM participant WHERE activity_id = $1`,
          [activity.id],
        );

        await client.query("COMMIT");

        const payload: RosterReplacedView = {
          participantCount: Number(countRows[0].count),
          configVersion: updated[0].config_version,
        };
        return ok(payload);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  );

  // ---------------------------------------------------------------- 作废
  app.post<{ Params: { activityId: string }; Body: { reason?: string } }>(
    "/api/activities/:activityId/void",
    async (req, reply) => {
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return reply;

      if (row.lifecycle === "VOID") {
        const { status, body } = fail("ACTIVITY_VOID", "活动已作废", 409);
        return reply.code(status).send(body);
      }
      if (row.lifecycle !== "PUBLISHED") {
        const { status, body } = fail(
          "INVALID_INPUT",
          `只有已发布且尚未成功分配的活动可以作废，当前状态为${LIFECYCLE_LABEL[row.lifecycle]}`,
          400,
        );
        return reply.code(status).send(body);
      }

      const reason = String(req.body?.reason ?? "").trim();
      if (reason.length === 0) {
        const { status, body } = fail("INVALID_INPUT", "作废必须填写原因", 400, {
          fieldErrors: [fieldError("reason", "REQUIRED", "作废必须填写原因")],
        });
        return reply.code(status).send(body);
      }
      if (reason.length > 500) {
        const { status, body } = fail("INVALID_INPUT", "原因最多 500 个字符", 400, {
          fieldErrors: [fieldError("reason", "TOO_LONG", "原因最多 500 个字符")],
        });
        return reply.code(status).send(body);
      }

      // 注意：void_at / void_reason 两列需迁移补齐，见 docs 说明。
      const { rows } = await pool.query<{ void_at: Date }>(
        `UPDATE activity
         SET lifecycle = 'VOID', void_at = NOW(), void_reason = $2,
             config_version = config_version + 1
         WHERE id = $1 AND lifecycle = 'PUBLISHED'
         RETURNING void_at`,
        [row.id, reason],
      );
      if (rows.length === 0) {
        const { status, body } = fail("VERSION_CONFLICT", "活动状态已变化，请刷新后重试", 409);
        return reply.code(status).send(body);
      }

      const payload: VoidView = {
        lifecycle: "VOID",
        voidAt: rows[0].void_at.toISOString(),
        reason,
      };
      return ok(payload);
    },
  );

  // ---------------------------------------------------------------- 题目：列表
  app.get<{
    Params: { activityId: string };
    Querystring: { q?: string; tag?: string };
  }>("/api/activities/:activityId/topics", async (req, reply) => {
    if (!req.actor) {
      const { status, body } = fail("UNAUTHENTICATED", "请先登录", 401);
      return reply.code(status).send(body);
    }

    const activityId = req.params.activityId;
    // 学生视角需要 participantId 判断 canChoose；教师视角留空。
    let studentParticipantId: string | null = null;

    // 教师看自己的活动；学生必须在名单内，否则按「找不到」处理。
    if (req.actor.role === "TEACHER") {
      const owned = await loadOwnedActivity(req, reply, activityId);
      if (!owned) return reply;
    } else {
      const { rows: member } = await pool.query<{ id: string }>(
        `SELECT p.id FROM participant p
         JOIN account a ON a.student_profile_id = p.student_profile_id
         WHERE p.activity_id = $1 AND a.id = $2`,
        [activityId, req.actor.accountId],
      );
      const { rows: act } = await pool.query<{ lifecycle: Lifecycle }>(
        `SELECT lifecycle FROM activity WHERE id = $1`,
        [activityId],
      );
      if (member.length === 0 || act.length === 0 || act[0].lifecycle === "DRAFT") {
        const { status, body } = fail("RESOURCE_NOT_FOUND", "活动不存在", 404);
        return reply.code(status).send(body);
      }
      studentParticipantId = member[0].id;
    }

    const { q, tag } = req.query ?? {};
    const conditions = ["t.activity_id = $1"];
    const params: unknown[] = [activityId];

    if (q && q.trim() !== "") {
      params.push(`%${q.trim()}%`);
      const i = params.length;
      conditions.push(`(t.title ILIKE $${i} OR t.description ILIKE $${i})`);
    }
    if (tag) {
      params.push(tag);
      conditions.push(`$${params.length} = ANY(t.tags)`);
    }

    const { rows } = await pool.query<TopicRow>(
      `SELECT t.*,
              COALESCE(
                (SELECT COUNT(*) FROM preference pref WHERE pref.topic_id = t.id),
                0
              )::int AS preference_count
       FROM topic t
       WHERE ${conditions.join(" AND ")}
       ORDER BY t.created_at, t.title`,
      params,
    ).catch(async (err: { code?: string }) => {
      // preference 表由 M3 负责；未落地时热度按 0 处理，不阻断题目列表。
      if (err.code !== "42P01") throw err;
      return pool.query<TopicRow>(
        `SELECT t.*, 0 AS preference_count FROM topic t
         WHERE ${conditions.join(" AND ")}
         ORDER BY t.created_at, t.title`,
        params,
      );
    });

    const eligibleMap = await loadEligibleParticipantIds(rows.map((r) => r.id));

    const items = rows.map((row) =>
      req.actor!.role === "TEACHER"
        ? toTeacherTopicView(row, eligibleMap.get(row.id) ?? [])
        : toStudentTopicView(
            row,
            eligibleMap.get(row.id) ?? [],
            studentParticipantId ?? "",
          ),
    );

    return ok({
      items,
      heatAsOf: new Date().toISOString(),
      heatSource: "LIVE" as const,
    });
  });

  // ---------------------------------------------------------------- 题目：新建
  app.post<{ Params: { activityId: string }; Body: TopicCreateInput }>(
    "/api/activities/:activityId/topics",
    async (req, reply) => {
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return reply;
      if (!requireDraft(row, reply)) return reply;

      const input = (req.body ?? {}) as Partial<TopicCreateInput>;
      if (!checkConfigVersion(row, input.expectedConfigVersion, reply)) return reply;

      const { fieldErrors, values } = validateTopicCreate(input);
      if (fieldErrors.length > 0) {
        const { status, body } = fail("INVALID_INPUT", "题目信息有误", 400, { fieldErrors });
        return reply.code(status).send(body);
      }

      const invalid = await validateEligibleIds(row.id, values.ids ?? []);
      if (invalid.length > 0) {
        const { status, body } = fail("INVALID_INPUT", "限定名单里有不属于本活动名单的学生", 400, {
          fieldErrors: invalid,
        });
        return reply.code(status).send(body);
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: created } = await client.query<TopicRow>(
          `INSERT INTO topic (
             id, activity_id, title, description, tags, capacity,
             eligibility_mode, eligibility_description
           ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            row.id,
            values.title,
            values.description ?? "",
            values.tags ?? [],
            values.capacity,
            values.eligibilityMode,
            values.eligibilityDescription ?? "",
          ],
        );
        const topicId = created[0].id;

        if (values.eligibilityMode === "EXPLICIT" && (values.ids?.length ?? 0) > 0) {
          await client.query(
            `INSERT INTO topic_eligible_participant (topic_id, participant_id)
             SELECT $1, unnest($2::uuid[])`,
            [topicId, values.ids],
          );
        }

        const { rows: versionRows } = await client.query<{ config_version: number }>(
          `UPDATE activity SET config_version = config_version + 1
           WHERE id = $1 RETURNING config_version`,
          [row.id],
        );
        await client.query("COMMIT");

        const eligibleMap = await loadEligibleParticipantIds([topicId]);
        return ok({
          topic: toTeacherTopicView(created[0], eligibleMap.get(topicId) ?? []),
          configVersion: versionRows[0].config_version,
        });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  );

  // ---------------------------------------------------------------- 题目：修改
  app.patch<{ Params: { activityId: string; topicId: string }; Body: TopicPatchInput }>(
    "/api/activities/:activityId/topics/:topicId",
    async (req, reply) => {
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return reply;
      if (!requireDraft(row, reply)) return reply;

      const input = (req.body ?? {}) as Partial<TopicPatchInput>;
      if (!checkConfigVersion(row, input.expectedConfigVersion, reply)) return reply;

      const existing = await loadTopic(row.id, req.params.topicId, reply);
      if (!existing) return reply;

      const { fieldErrors, values } = validateTopicFields(input);
      const eligibility = validateEligibility(input);
      const allErrors = [...fieldErrors, ...eligibility.fieldErrors];

      const hasAnyChange =
        Object.keys(values).length > 0 || eligibility.mode !== undefined;
      if (!hasAnyChange && allErrors.length === 0) {
        const { status, body } = fail("INVALID_INPUT", "没有需要修改的字段", 400);
        return reply.code(status).send(body);
      }
      if (allErrors.length > 0) {
        const { status, body } = fail("INVALID_INPUT", "题目信息有误", 400, {
          fieldErrors: allErrors,
        });
        return reply.code(status).send(body);
      }

      if (eligibility.mode !== undefined) {
        const invalid = await validateEligibleIds(row.id, eligibility.ids ?? []);
        if (invalid.length > 0) {
          const { status, body } = fail(
            "INVALID_INPUT",
            "限定名单里有不属于本活动名单的学生",
            400,
            { fieldErrors: invalid },
          );
          return reply.code(status).send(body);
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const sets: string[] = [];
        const params: unknown[] = [];
        for (const [key, column] of Object.entries(TOPIC_FIELD_COLUMNS)) {
          const value = values[key as keyof typeof values];
          if (value === undefined) continue;
          params.push(value);
          sets.push(`${column} = $${params.length}`);
        }
        if (eligibility.mode !== undefined) {
          params.push(eligibility.mode);
          sets.push(`eligibility_mode = $${params.length}`);
        }

        params.push(existing.id);
        const { rows: updated } = await client.query<TopicRow>(
          `UPDATE topic SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
          params,
        );

        // 资格名单整体重写：模式为 ALL 时清空，EXPLICIT 时按新名单覆盖。
        if (eligibility.mode !== undefined) {
          await client.query(
            `DELETE FROM topic_eligible_participant WHERE topic_id = $1`,
            [existing.id],
          );
          if (eligibility.mode === "EXPLICIT" && (eligibility.ids?.length ?? 0) > 0) {
            await client.query(
              `INSERT INTO topic_eligible_participant (topic_id, participant_id)
               SELECT $1, unnest($2::uuid[])`,
              [existing.id, eligibility.ids],
            );
          }
        }

        const { rows: versionRows } = await client.query<{ config_version: number }>(
          `UPDATE activity SET config_version = config_version + 1
           WHERE id = $1 RETURNING config_version`,
          [row.id],
        );
        await client.query("COMMIT");

        const eligibleMap = await loadEligibleParticipantIds([existing.id]);
        return ok({
          topic: toTeacherTopicView(updated[0], eligibleMap.get(existing.id) ?? []),
          configVersion: versionRows[0].config_version,
        });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  );

  // ---------------------------------------------------------------- 题目：删除
  app.delete<{ Params: { activityId: string; topicId: string }; Body: ConfigVersionInput }>(
    "/api/activities/:activityId/topics/:topicId",
    async (req, reply) => {
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return reply;
      if (!requireDraft(row, reply)) return reply;

      if (!checkConfigVersion(row, req.body?.expectedConfigVersion, reply)) return reply;

      const existing = await loadTopic(row.id, req.params.topicId, reply);
      if (!existing) return reply;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM topic WHERE id = $1`, [existing.id]);
        const { rows: versionRows } = await client.query<{ config_version: number }>(
          `UPDATE activity SET config_version = config_version + 1
           WHERE id = $1 RETURNING config_version`,
          [row.id],
        );
        await client.query("COMMIT");
        return ok({ configVersion: versionRows[0].config_version });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  );

  // ---------------------------------------------------------------- 发布
  app.post<{ Params: { activityId: string }; Body: ConfigVersionInput }>(
    "/api/activities/:activityId/publish",
    async (req, reply) => {
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return reply;

      if (row.lifecycle !== "DRAFT") {
        const { status, body } = fail(
          "CONFIG_LOCKED",
          `只有草稿可以发布，当前状态为${LIFECYCLE_LABEL[row.lifecycle]}`,
          409,
        );
        return reply.code(status).send(body);
      }
      if (!checkConfigVersion(row, req.body?.expectedConfigVersion, reply)) return reply;

      const blockers = await publishBlockers(row);
      if (blockers.length > 0) {
        const { status, body } = fail(
          "INVALID_INPUT",
          `配置未齐备，不能发布：${blockers.map((b) => b.message).join("；")}`,
          400,
          { fieldErrors: blockers },
        );
        return reply.code(status).send(body);
      }

      const { rows } = await pool.query<ActivityRow>(
        `UPDATE activity
         SET lifecycle = 'PUBLISHED', published_at = NOW(),
             config_version = config_version + 1
         WHERE id = $1 AND lifecycle = 'DRAFT'
         RETURNING *`,
        [row.id],
      );
      if (rows.length === 0) {
        const { status, body } = fail("VERSION_CONFLICT", "活动状态已变化，请刷新后重试", 409);
        return reply.code(status).send(body);
      }

      return ok(toActivityView(rows[0]));
    },
  );
};

