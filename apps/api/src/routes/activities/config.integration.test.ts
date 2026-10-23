/**
 * M2 活动配置 · 接口集成测试（真实 PostgreSQL）
 *
 * 依据 docs/testing/api-integration-tests.md 的决议：采用方案 A，
 * 对真实 PG 跑迁移 + 真实 buildApp()，不引入 PGlite 作为默认依赖。
 *
 * 运行方式：
 *   docker compose up -d
 *   set -a && source .env && set +a          # 或手动设置 DATABASE_URL
 *   npm run test:api:integration
 *
 * 未设置 DATABASE_URL 时整个套件跳过，因此 `npm test` 在无数据库环境下不会失败。
 *
 * 说明：本文件的用例按声明顺序执行，共享一个活动与一次名单导入流程，
 * 因为「发布」依赖前序状态。这与 docs/testing/m2-test-cases.md 的编号一一对应。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "db", "migrations");

const DATABASE_URL = process.env.DATABASE_URL;
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

// 没有数据库时整组跳过：默认 `npm test` 不应因为缺少环境而失败。
const suite = DATABASE_URL ? describe : describe.skip;

const PASSWORD = "Coursematch-Dev-2026";
const JSON_H = { "content-type": "application/json" };
const CSV_H = { "content-type": "text/csv" };

const GOOD_CSV =
  "学号,姓名,入学年,专业,班级\n" +
  "20260001,演示学生甲,2026,软件工程,1班\n" +
  "20260002,演示学生乙,2026,软件工程,1班\n" +
  "20260003,演示学生丙,2026,软件工程,2班\n";

interface ActivityData {
  activityId: string;
  configVersion: number;
  lifecycle: string;
  phase: string;
  allowedActions: string[];
}

interface ParticipantItem {
  participantId: string;
  studentNumber: string;
  name: string;
  accountConfigured: boolean;
}

interface QueryResult {
  rows: Record<string, unknown>[];
}

/** 最小类型声明：避免把 pool / buildApp 的导入提到模块顶层。 */
interface TestPool {
  query: (text: string, params?: unknown[]) => Promise<QueryResult>;
  end: () => Promise<void>;
}

interface TestApp {
  inject: (opts: unknown) => Promise<{ statusCode: number; body: string }>;
  ready: () => Promise<void>;
  close: () => Promise<void>;
}

let app: TestApp;
let pool: TestPool;

let T1 = "";
let T2 = "";
let ST = "";

const H = (token: string, extra?: Record<string, string>) => ({
  cookie: `cm-session=${token}`,
  origin: WEB_ORIGIN,
  "x-coursematch-request": "1",
  ...(extra ?? {}),
});

const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

function draftPayload(title: string) {
  return {
    title,
    description: "d",
    startAt: iso(3600_000),
    deadlineAt: iso(7 * 86400_000),
    maxPreferences: 3,
  };
}

async function inject(opts: {
  method: string;
  url: string;
  headers: Record<string, string>;
  payload?: unknown;
}) {
  const res = await app.inject(opts);
  let body: any = null;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = null;
  }
  return { code: res.statusCode, body, data: body?.data, error: body?.error };
}

async function createActivity(title: string) {
  return inject({
    method: "POST",
    url: "/api/activities",
    headers: H(T1, JSON_H),
    payload: draftPayload(title),
  });
}

async function replaceRoster(activityId: string, version: number, csv: string) {
  return inject({
    method: "PUT",
    url: `/api/activities/${activityId}/participants?expectedConfigVersion=${version}`,
    headers: H(T1, CSV_H),
    payload: csv,
  });
}

async function countParticipants(activityId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM participant WHERE activity_id = $1`,
    [activityId],
  );
  return rows[0].c as number;
}

async function makeSession(identifier: string): Promise<string> {
  const { randomBytes, createHash } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const digest = createHash("sha256").update(token).digest("hex");
  await pool.query(
    `INSERT INTO session (id, account_id, credential_digest, expires_at)
     SELECT gen_random_uuid(), id, $2, NOW() + INTERVAL '1 hour'
     FROM account WHERE identifier = $1`,
    [identifier, digest],
  );
  return token;
}

// ---------------------------------------------------------------- 测试主体

suite("M2 活动配置接口（真实 PostgreSQL）", () => {
  let activityId = "";
  let version = 0;
  let topicA = "";
  let topicB = "";
  let participantA = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.WEB_ORIGIN = WEB_ORIGIN;

    const db = await import("../../db/pool.js");
    pool = db.pool as unknown as TestPool;
    const { buildApp } = await import("../../app.js");
    app = (await buildApp()) as unknown as TestApp;

    // 依序应用全部迁移（与 db/migrate.ts 一致）
    const files = readdirSync(migrationsDir)
      .filter((n) => n.endsWith(".sql"))
      .sort();
    for (const f of files) {
      await pool.query(readFileSync(join(migrationsDir, f), "utf8"));
    }

    // 清空业务数据，保证可重复运行
    for (const table of [
      "operation_log",
      "allocation_result",
      "allocation_batch",
      "freeze_snapshot",
      "preference",
      "preference_submission",
      "topic_eligible_participant",
      "topic",
      "participant",
      "activity",
      "session",
      "account",
      "student_profile",
    ]) {
      await pool.query(`DELETE FROM ${table}`);
    }

    const bcrypt = (await import("bcryptjs")).default;
    const hash = await bcrypt.hash(PASSWORD, 4);

    await pool.query(
      `INSERT INTO account (id, identifier, role, password_hash, student_profile_id)
       VALUES (gen_random_uuid(), 'teacher01', 'TEACHER', $1, NULL),
              (gen_random_uuid(), 'teacher02', 'TEACHER', $1, NULL)`,
      [hash],
    );
    for (const [no, name, cls] of [
      ["20260001", "演示学生甲", "1班"],
      ["20260002", "演示学生乙", "1班"],
      ["20260003", "演示学生丙", "2班"],
    ]) {
      await pool.query(
        `INSERT INTO student_profile (id, student_number, name, enrollment_year, major, class_name)
         VALUES (gen_random_uuid(), $1, $2, '2026', '软件工程', $3)`,
        [no, name, cls],
      );
    }
    await pool.query(
      `INSERT INTO account (id, identifier, role, password_hash, student_profile_id)
       SELECT gen_random_uuid(), '20260001', 'STUDENT', $1, id
       FROM student_profile WHERE student_number = '20260001'`,
      [hash],
    );

    T1 = await makeSession("teacher01");
    T2 = await makeSession("teacher02");
    ST = await makeSession("20260001");

    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  // ------------------------------------------------------------ 活动配置

  describe("活动配置", () => {
    it("TC-M2-001 创建草稿成功", async () => {
      const r = await createActivity("主用例活动");
      expect(r.code).toBe(200);
      expect(r.data.configVersion).toBe(0);
      expect(r.data.lifecycle).toBe("DRAFT");
      activityId = r.data.activityId;
    });

    it("TC-M2-002 截止早于开始被拒", async () => {
      const r = await inject({
        method: "POST",
        url: "/api/activities",
        headers: H(T1, JSON_H),
        payload: {
          title: "时间颠倒",
          description: "",
          startAt: iso(86400_000),
          deadlineAt: iso(3600_000),
          maxPreferences: 3,
        },
      });
      expect(r.code).toBe(400);
      expect(r.error.code).toBe("INVALID_INPUT");
      expect(r.error.fieldErrors.some((e: any) => e.field === "deadlineAt")).toBe(true);
    });

    it("TC-M2-003 最大志愿数越界被拒", async () => {
      const r = await inject({
        method: "POST",
        url: "/api/activities",
        headers: H(T1, JSON_H),
        payload: {
          title: "志愿越界",
          description: "",
          startAt: iso(3600_000),
          deadlineAt: iso(86400_000),
          maxPreferences: 5,
        },
      });
      expect(r.code).toBe(400);
    });

    it("TC-M2-004 活动名称为空白被拒", async () => {
      const r = await inject({
        method: "POST",
        url: "/api/activities",
        headers: H(T1, JSON_H),
        payload: {
          title: "   ",
          description: "",
          startAt: iso(3600_000),
          deadlineAt: iso(86400_000),
          maxPreferences: 3,
        },
      });
      expect(r.code).toBe(400);
      expect(r.error.fieldErrors.some((e: any) => e.field === "title")).toBe(true);
    });

    it("TC-M2-005 旧版本号触发 VERSION_CONFLICT", async () => {
      const r = await inject({
        method: "PATCH",
        url: `/api/activities/${activityId}`,
        headers: H(T1, JSON_H),
        payload: { title: "改名", expectedConfigVersion: 99 },
      });
      expect(r.code).toBe(409);
      expect(r.error.code).toBe("VERSION_CONFLICT");
    });

    it("TC-M2-006 正常编辑且版本递增", async () => {
      const r = await inject({
        method: "PATCH",
        url: `/api/activities/${activityId}`,
        headers: H(T1, JSON_H),
        payload: { title: "主用例活动（改名）", expectedConfigVersion: 0 },
      });
      expect(r.code).toBe(200);
      expect(r.data.configVersion).toBe(1);
    });

    it("TC-M2-007 PATCH 不含可改字段被拒", async () => {
      const r = await inject({
        method: "PATCH",
        url: `/api/activities/${activityId}`,
        headers: H(T1, JSON_H),
        payload: { expectedConfigVersion: 1 },
      });
      expect(r.code).toBe(400);
    });

    it("TC-M2-008 他人活动返回 404", async () => {
      const r = await inject({
        method: "GET",
        url: `/api/activities/${activityId}/participants`,
        headers: H(T2),
      });
      expect(r.code).toBe(404);
      expect(r.error.code).toBe("RESOURCE_NOT_FOUND");
    });
  });

  // ------------------------------------------------------------ 名单与 CSV

  describe("参与名单与 CSV", () => {
    it("TC-M2-009 列数不足报 COLUMN_COUNT", async () => {
      const r = await replaceRoster(
        activityId,
        1,
        "学号,姓名,入学年,专业,班级\n20260001,演示学生甲,2026,软件工程,1班\n20260002,演示学生乙\n",
      );
      expect(r.code).toBe(400);
      expect(r.error.code).toBe("IMPORT_INVALID");
      expect(r.error.rowErrors[0].code).toBe("COLUMN_COUNT");
    });

    it("TC-M2-010 姓名为空被拒", async () => {
      const r = await replaceRoster(
        activityId,
        1,
        "学号,姓名,入学年,专业,班级\n20260001,,2026,软件工程,1班\n",
      );
      expect(r.code).toBe(400);
      expect(r.error.rowErrors[0].field).toBe("name");
    });

    it("TC-M2-011 入学年非四位被拒", async () => {
      const r = await replaceRoster(
        activityId,
        1,
        "学号,姓名,入学年,专业,班级\n20260001,甲,26,软件工程,1班\n",
      );
      expect(r.code).toBe(400);
      expect(r.error.rowErrors[0].code).toBe("INVALID_FORMAT");
    });

    it("TC-M2-012 学号重复被拒", async () => {
      const r = await replaceRoster(
        activityId,
        1,
        "学号,姓名,入学年,专业,班级\n20260001,甲,2026,软件工程,1班\n20260001,甲,2026,软件工程,1班\n",
      );
      expect(r.code).toBe(400);
      expect(r.error.rowErrors[0].code).toBe("DUPLICATE");
    });

    it("TC-M2-013 与已有学生档案冲突被拒", async () => {
      const r = await replaceRoster(
        activityId,
        1,
        "学号,姓名,入学年,专业,班级\n20260001,错误姓名,2026,软件工程,1班\n",
      );
      expect(r.code).toBe(400);
      expect(r.error.rowErrors[0].code).toBe("PROFILE_MISMATCH");
    });

    it("TC-M2-014 多次非法导入后名单仍为空", async () => {
      expect(await countParticipants(activityId)).toBe(0);
    });

    it("TC-M2-015 预览不写库", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/preview?expectedConfigVersion=1`,
        headers: H(T1, CSV_H),
        payload: GOOD_CSV,
      });
      expect(r.code).toBe(200);
      expect(r.data.addedCount).toBe(3);
      expect(await countParticipants(activityId)).toBe(0);
    });

    it("TC-M2-016 整份替换成功", async () => {
      const r = await replaceRoster(activityId, 1, GOOD_CSV);
      expect(r.code).toBe(200);
      expect(r.data.participantCount).toBe(3);
      version = r.data.configVersion;
    });

    it("TC-M2-017 成功后再次失败不破坏旧名单", async () => {
      const r = await replaceRoster(
        activityId,
        version,
        "学号,姓名,入学年,专业,班级\n20260001,演示学生甲,2026,软件工程,1班\n20260009,缺列\n",
      );
      expect(r.code).toBe(400);
      expect(await countParticipants(activityId)).toBe(3);
    });

    it("TC-M2-018 名单查询返回 3 条", async () => {
      const r = await inject({
        method: "GET",
        url: `/api/activities/${activityId}/participants`,
        headers: H(T1),
      });
      expect(r.code).toBe(200);
      expect(r.data.items).toHaveLength(3);
      const items = r.data.items as ParticipantItem[];
      participantA = items.find((i) => i.studentNumber === "20260001")!.participantId;
    });

    it("TC-M2-019 按班级筛选", async () => {
      const r = await inject({
        method: "GET",
        url: `/api/activities/${activityId}/participants?className=2班`,
        headers: H(T1),
      });
      expect(r.data.items).toHaveLength(1);
    });

    it("TC-M2-020 按姓名关键字搜索", async () => {
      const r = await inject({
        method: "GET",
        url: `/api/activities/${activityId}/participants?q=丙`,
        headers: H(T1),
      });
      expect(r.data.items).toHaveLength(1);
    });

    it("TC-M2-021 accountConfigured 区分已建号与未建号", async () => {
      const r = await inject({
        method: "GET",
        url: `/api/activities/${activityId}/participants`,
        headers: H(T1),
      });
      const items = r.data.items as ParticipantItem[];
      expect(items.find((i) => i.studentNumber === "20260001")!.accountConfigured).toBe(true);
      expect(items.find((i) => i.studentNumber === "20260002")!.accountConfigured).toBe(false);
    });
  });

  // ------------------------------------------------------------ 题目与资格

  describe("题目与资格", () => {
    it("TC-M2-022 无题目时不能发布", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/publish`,
        headers: H(T1, JSON_H),
        payload: { expectedConfigVersion: version },
      });
      expect(r.code).toBe(400);
      expect(r.error.fieldErrors.some((e: any) => e.field === "topics")).toBe(true);
    });

    it("TC-M2-023 创建 ALL 题目", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/topics`,
        headers: H(T1, JSON_H),
        payload: {
          title: "题目A",
          description: "d",
          tags: ["前端", "React"],
          capacity: 2,
          eligibilityDescription: "",
          eligibilityMode: "ALL",
          expectedConfigVersion: version,
        },
      });
      expect(r.code).toBe(200);
      expect(r.data.topic.eligibleParticipantIds).toEqual([]);
      topicA = r.data.topic.topicId;
      version = r.data.configVersion;
    });

    it("TC-M2-024 创建 EXPLICIT 题目", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/topics`,
        headers: H(T1, JSON_H),
        payload: {
          title: "题目B",
          description: "",
          tags: [],
          capacity: 1,
          eligibilityDescription: "仅限甲",
          eligibilityMode: "EXPLICIT",
          eligibleParticipantIds: [participantA],
          expectedConfigVersion: version,
        },
      });
      expect(r.code).toBe(200);
      expect(r.data.topic.eligibleParticipantIds).toHaveLength(1);
      topicB = r.data.topic.topicId;
      version = r.data.configVersion;
    });

    it("TC-M2-025 EXPLICIT 未指定学生被拒", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/topics`,
        headers: H(T1, JSON_H),
        payload: {
          title: "X",
          description: "",
          tags: [],
          capacity: 1,
          eligibilityDescription: "",
          eligibilityMode: "EXPLICIT",
          eligibleParticipantIds: [],
          expectedConfigVersion: version,
        },
      });
      expect(r.code).toBe(400);
    });

    it("TC-M2-026 名额为 0 被拒", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/topics`,
        headers: H(T1, JSON_H),
        payload: {
          title: "X",
          description: "",
          tags: [],
          capacity: 0,
          eligibilityDescription: "",
          eligibilityMode: "ALL",
          expectedConfigVersion: version,
        },
      });
      expect(r.code).toBe(400);
    });

    it("TC-M2-027 限定名单含非本活动学生被拒", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/topics`,
        headers: H(T1, JSON_H),
        payload: {
          title: "X",
          description: "",
          tags: [],
          capacity: 1,
          eligibilityDescription: "",
          eligibilityMode: "EXPLICIT",
          eligibleParticipantIds: ["00000000-0000-0000-0000-000000000000"],
          expectedConfigVersion: version,
        },
      });
      expect(r.code).toBe(400);
    });

    it("TC-M2-028 按标签筛选题目", async () => {
      const r = await inject({
        method: "GET",
        url: `/api/activities/${activityId}/topics?tag=React`,
        headers: H(T1),
      });
      expect(r.data.items).toHaveLength(1);
    });

    it("TC-M2-029 修改题目名额", async () => {
      const r = await inject({
        method: "PATCH",
        url: `/api/activities/${activityId}/topics/${topicA}`,
        headers: H(T1, JSON_H),
        payload: { capacity: 5, expectedConfigVersion: version },
      });
      expect(r.code).toBe(200);
      expect(r.data.topic.capacity).toBe(5);
      version = r.data.configVersion;
    });

    it("TC-M2-030 EXPLICIT 改回 ALL 并清空名单", async () => {
      const r = await inject({
        method: "PATCH",
        url: `/api/activities/${activityId}/topics/${topicB}`,
        headers: H(T1, JSON_H),
        payload: { eligibilityMode: "ALL", expectedConfigVersion: version },
      });
      expect(r.code).toBe(200);
      expect(r.data.topic.eligibleParticipantIds).toEqual([]);
      version = r.data.configVersion;
    });

    it("TC-M2-031 删除题目", async () => {
      const created = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/topics`,
        headers: H(T1, JSON_H),
        payload: {
          title: "待删除",
          description: "",
          tags: [],
          capacity: 1,
          eligibilityDescription: "",
          eligibilityMode: "ALL",
          expectedConfigVersion: version,
        },
      });
      version = created.data.configVersion;
      const r = await inject({
        method: "DELETE",
        url: `/api/activities/${activityId}/topics/${created.data.topic.topicId}`,
        headers: H(T1, JSON_H),
        payload: { expectedConfigVersion: version },
      });
      expect(r.code).toBe(200);
      version = r.data.configVersion;
    });
  });

  // ------------------------------------------------------------ 发布与作废

  describe("发布、锁定与作废", () => {
    it("TC-M2-032 学生看不到草稿活动的题目", async () => {
      const r = await inject({
        method: "GET",
        url: `/api/activities/${activityId}/topics`,
        headers: H(ST),
      });
      expect(r.code).toBe(404);
    });

    it("TC-M2-033 齐备后发布成功", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/publish`,
        headers: H(T1, JSON_H),
        payload: { expectedConfigVersion: version },
      });
      expect(r.code).toBe(200);
      expect(r.data.lifecycle).toBe("PUBLISHED");
      version = r.data.configVersion;
    });

    it("TC-M2-034 重复发布被拒", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/publish`,
        headers: H(T1, JSON_H),
        payload: { expectedConfigVersion: version },
      });
      expect(r.code).toBe(409);
    });

    it("TC-M2-035 发布后改标题被锁", async () => {
      const r = await inject({
        method: "PATCH",
        url: `/api/activities/${activityId}`,
        headers: H(T1, JSON_H),
        payload: { title: "发布后改标题", expectedConfigVersion: version },
      });
      expect(r.code).toBe(409);
      expect(r.error.code).toBe("CONFIG_LOCKED");
    });

    it("TC-M2-036 发布后改说明仍允许", async () => {
      const r = await inject({
        method: "PATCH",
        url: `/api/activities/${activityId}`,
        headers: H(T1, JSON_H),
        payload: { description: "只改说明", expectedConfigVersion: version },
      });
      expect(r.code).toBe(200);
      version = r.data.configVersion ?? version;
    });

    it("TC-M2-037 发布后新增题目被拒", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/topics`,
        headers: H(T1, JSON_H),
        payload: {
          title: "发布后新增",
          description: "",
          tags: [],
          capacity: 1,
          eligibilityDescription: "",
          eligibilityMode: "ALL",
          expectedConfigVersion: version,
        },
      });
      expect(r.code).toBe(409);
    });

    it("TC-M2-038 发布后替换名单被拒", async () => {
      const r = await replaceRoster(activityId, version, GOOD_CSV);
      expect(r.code).toBe(409);
    });

    it("TC-M2-039 学生可见题目且不泄露限定名单", async () => {
      const r = await inject({
        method: "GET",
        url: `/api/activities/${activityId}/topics`,
        headers: H(ST),
      });
      expect(r.code).toBe(200);
      for (const item of r.data.items) {
        expect(item.eligibleParticipantIds).toBeUndefined();
        expect(typeof item.canChoose).toBe("boolean");
      }
    });

    it("TC-M2-040 草稿不能作废", async () => {
      const draft = await createActivity("作废测试");
      const r = await inject({
        method: "POST",
        url: `/api/activities/${draft.data.activityId}/void`,
        headers: H(T1, JSON_H),
        payload: { reason: "x" },
      });
      expect(r.code).toBe(400);
    });

    it("TC-M2-041 作废缺原因被拒", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/void`,
        headers: H(T1, JSON_H),
        payload: { reason: "   " },
      });
      expect(r.code).toBe(400);
    });

    it("TC-M2-042 已发布可作废", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/void`,
        headers: H(T1, JSON_H),
        payload: { reason: "配置有误，重新建活动" },
      });
      expect(r.code).toBe(200);
      expect(r.data.lifecycle).toBe("VOID");
      expect(r.data.voidAt).toBeTruthy();
    });
  });

  // ------------------------------------------------------------ 权限与 CSRF

  describe("权限与 CSRF", () => {
    it("TC-M2-043 学生调用教师写接口返回 403", async () => {
      const r = await inject({
        method: "POST",
        url: "/api/activities",
        headers: H(ST, JSON_H),
        payload: draftPayload("学生建的"),
      });
      expect(r.code).toBe(403);
      expect(r.error.code).toBe("ROLE_FORBIDDEN");
    });

    it("TC-M2-044 学生调用作废返回 403", async () => {
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/void`,
        headers: H(ST, JSON_H),
        payload: { reason: "x" },
      });
      expect(r.code).toBe(403);
    });

    it("TC-M2-045 伪造 Origin 被 CSRF 拦截", async () => {
      const r = await inject({
        method: "POST",
        url: "/api/activities",
        headers: {
          cookie: `cm-session=${T1}`,
          origin: "http://evil.example.com",
          ...JSON_H,
        },
        payload: draftPayload("x"),
      });
      expect(r.code).toBe(403);
      expect(r.error.code).toBe("REQUEST_ORIGIN_FORBIDDEN");
    });

    it("TC-M2-046 缺少安全请求头被拦截", async () => {
      const r = await inject({
        method: "POST",
        url: "/api/activities",
        headers: { cookie: `cm-session=${T1}`, origin: WEB_ORIGIN, ...JSON_H },
        payload: draftPayload("x"),
      });
      expect(r.code).toBe(403);
    });

    it("TC-M2-047 未登录访问被拒", async () => {
      const r = await inject({
        method: "GET",
        url: `/api/activities/${activityId}/participants`,
        headers: { origin: WEB_ORIGIN },
      });
      expect([401, 404]).toContain(r.code);
    });
  });
});
