/**
 * 教师一键开通学生账号 · 接口集成测试（真实 PostgreSQL）
 *
 * 被测对象是 c6ab994 引入的 provision-accounts 能力：
 *   POST /api/activities/:activityId/participants/provision-accounts
 *   apps/api/src/lib/provision-student-accounts.ts
 *
 * 该接口不属于 M2 原始契约，但代码落在 M2 的 config.ts 内，此前无任何测试，
 * 因此按 docs/testing/m2-test-cases.md 的缺陷规范补充覆盖。
 *
 * 运行方式同 config.integration.test.ts：
 *   docker compose up -d
 *   npm run test:api:integration
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "db", "migrations");

const DATABASE_URL = process.env.DATABASE_URL;
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

const suite = DATABASE_URL ? describe : describe.skip;

const PASSWORD = "Coursematch-Dev-2026";
const JSON_H = { "content-type": "application/json" };
const CSV_H = { "content-type": "text/csv" };

const GOOD_CSV =
  "学号,姓名,入学年,专业,班级\n" +
  "20260001,演示学生甲,2026,软件工程,1班\n" +
  "20260002,演示学生乙,2026,软件工程,1班\n" +
  "20260003,演示学生丙,2026,软件工程,2班\n";

interface QueryResult {
  rows: Record<string, unknown>[];
}

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

/** 建一个带名单的草稿活动，返回 activityId 与版本号 */
async function seedActivityWithRoster(
  title: string,
  csv = GOOD_CSV,
): Promise<{ activityId: string; configVersion: number }> {
  const created = await inject({
    method: "POST",
    url: "/api/activities",
    headers: H(T1),
    payload: {
      title,
      description: "d",
      startAt: iso(3600_000),
      deadlineAt: iso(7 * 86400_000),
      maxPreferences: 3,
    },
  });
  const activityId = created.data.activityId as string;

  const replaced = await inject({
    method: "PUT",
    url: `/api/activities/${activityId}/participants?expectedConfigVersion=0`,
    headers: H(T1, CSV_H),
    payload: csv,
  });
  return { activityId, configVersion: replaced.data.configVersion as number };
}

async function accountCount(): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM account`);
  return rows[0].c as number;
}

async function studentAccountNumbers(): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT identifier FROM account WHERE role = 'STUDENT' ORDER BY identifier`,
  );
  return rows.map((r) => r.identifier as string);
}

suite("教师一键开通学生账号（真实 PostgreSQL）", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.WEB_ORIGIN = WEB_ORIGIN;

    const db = await import("../../db/pool.js");
    pool = db.pool as unknown as TestPool;
    const { buildApp } = await import("../../app.js");
    app = (await buildApp()) as unknown as TestApp;

    const files = readdirSync(migrationsDir)
      .filter((n) => n.endsWith(".sql"))
      .sort();
    for (const f of files) {
      await pool.query(readFileSync(join(migrationsDir, f), "utf8"));
    }

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
    // 三名学生档案：全部未开通账号，用于验证一键开通
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

    T1 = await makeSession("teacher01");
    T2 = await makeSession("teacher02");

    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  // ------------------------------------------------------------ 正常路径

  describe("正常开通", () => {
    it("TC-M2-PROV-001 为名单内全部未开通学生建号", async () => {
      const before = await accountCount();
      const { activityId } = await seedActivityWithRoster("开通账号-正常");

      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/provision-accounts`,
        headers: H(T1),
      });

      expect(r.code).toBe(200);
      expect(r.data.provisionedCount).toBe(3);
      expect(r.data.identifiers).toEqual(["20260001", "20260002", "20260003"]);
      // 新增 3 个学生账号
      expect(await accountCount()).toBe(before + 3);
      expect(await studentAccountNumbers()).toEqual(["20260001", "20260002", "20260003"]);
    });

    it("TC-M2-PROV-002 账号 identifier 为学号且角色为 STUDENT", async () => {
      const { rows } = await pool.query(
        `SELECT acc.identifier, acc.role, sp.student_number
         FROM account acc
         JOIN student_profile sp ON sp.id = acc.student_profile_id
         WHERE acc.role = 'STUDENT'
         ORDER BY acc.identifier`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.identifier).toBe(row.student_number);
        expect(row.role).toBe("STUDENT");
      }
    });

    it("TC-M2-PROV-003 返回默认密码提示且账号可用该密码登录", async () => {
      const { activityId } = await seedActivityWithRoster("开通账号-登录验证");
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/provision-accounts`,
        headers: H(T1),
      });
      expect(r.code).toBe(200);
      expect(r.data.defaultPasswordHint).toBeTruthy();

      // 用返回的提示密码真实登录一次
      const login = await inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { ...JSON_H },
        payload: { identifier: "20260001", password: r.data.defaultPasswordHint },
      });
      expect(login.code).toBe(200);
      expect(login.data.role).toBe("STUDENT");
      expect(login.data.studentNumber).toBe("20260001");
    });
  });

  // ------------------------------------------------------------ 幂等与增量

  describe("幂等与增量", () => {
    it("TC-M2-PROV-004 重复调用不重复建号（幂等）", async () => {
      const { activityId } = await seedActivityWithRoster("开通账号-幂等");
      // 首次：全部已存在，应为 0
      const first = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/provision-accounts`,
        headers: H(T1),
      });
      expect(first.code).toBe(200);
      expect(first.data.provisionedCount).toBe(0);
      expect(first.data.identifiers).toEqual([]);

      const before = await accountCount();
      const again = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/provision-accounts`,
        headers: H(T1),
      });
      expect(again.code).toBe(200);
      expect(again.data.provisionedCount).toBe(0);
      expect(await accountCount()).toBe(before);
    });

    it("TC-M2-PROV-005 只补开缺失账号，不动已有账号", async () => {
      // 新建活动 + 新名单：20260004/20260005 未建号，20260001 已建号
      for (const [no, name, cls] of [
        ["20260004", "演示学生丁", "2班"],
        ["20260005", "演示学生戊", "3班"],
      ]) {
        await pool.query(
          `INSERT INTO student_profile (id, student_number, name, enrollment_year, major, class_name)
           VALUES (gen_random_uuid(), $1, $2, '2026', '软件工程', $3)`,
          [no, name, cls],
        );
      }
      const csv =
        "学号,姓名,入学年,专业,班级\n" +
        "20260001,演示学生甲,2026,软件工程,1班\n" +
        "20260004,演示学生丁,2026,软件工程,2班\n" +
        "20260005,演示学生戊,2026,软件工程,3班\n";
      const { activityId } = await seedActivityWithRoster("开通账号-增量", csv);

      const { rows: beforeRows } = await pool.query(
        `SELECT id FROM account WHERE identifier = '20260001'`,
      );
      const beforeId = beforeRows[0].id;

      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/provision-accounts`,
        headers: H(T1),
      });
      expect(r.code).toBe(200);
      expect(r.data.provisionedCount).toBe(2);
      expect(r.data.identifiers).toEqual(["20260004", "20260005"]);

      // 已存在的账号未被重建（id 不变）
      const { rows: afterRows } = await pool.query(
        `SELECT id FROM account WHERE identifier = '20260001'`,
      );
      expect(afterRows[0].id).toBe(beforeId);
    });

    it("TC-M2-PROV-006 只处理本活动名单内的学生", async () => {
      // 20260001 已在多个活动名单中；新建一个只含 20260005 的活动
      const csv =
        "学号,姓名,入学年,专业,班级\n20260005,演示学生戊,2026,软件工程,3班\n";
      const { activityId } = await seedActivityWithRoster("开通账号-范围", csv);

      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/provision-accounts`,
        headers: H(T1),
      });
      expect(r.code).toBe(200);
      // 20260005 已在上一个用例建过号，所以这里是 0
      expect(r.data.provisionedCount).toBe(0);
      expect(r.data.identifiers).toEqual([]);
    });
  });

  // ------------------------------------------------------------ 权限

  describe("权限", () => {
    it("TC-M2-PROV-007 学生调用返回 403", async () => {
      ST = await makeSession("20260001");
      const { activityId } = await seedActivityWithRoster("开通账号-学生越权");
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/provision-accounts`,
        headers: H(ST),
      });
      expect(r.code).toBe(403);
      expect(r.error.code).toBe("ROLE_FORBIDDEN");
    });

    it("TC-M2-PROV-008 他人活动返回 404", async () => {
      const { activityId } = await seedActivityWithRoster("开通账号-越权");
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/provision-accounts`,
        headers: H(T2),
      });
      expect(r.code).toBe(404);
      expect(r.error.code).toBe("RESOURCE_NOT_FOUND");
    });

    it("TC-M2-PROV-009 未登录被拒绝", async () => {
      const { activityId } = await seedActivityWithRoster("开通账号-匿名");
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/provision-accounts`,
        headers: { origin: WEB_ORIGIN },
      });
      // 该 URL 含 /participants，role-guard 会先按「教师专属」拦截无会话请求，
      // 因此在未登录场景返回 403 而非 401；两者都表示拒绝，不泄露活动是否存在。
      expect([401, 403, 404]).toContain(r.code);
    });

    it("TC-M2-PROV-010 缺少 CSRF 头被拦截", async () => {
      const { activityId } = await seedActivityWithRoster("开通账号-CSRF");
      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/provision-accounts`,
        headers: { cookie: `cm-session=${T1}`, origin: WEB_ORIGIN },
      });
      expect(r.code).toBe(403);
      expect(r.error.code).toBe("REQUEST_ORIGIN_FORBIDDEN");
    });
  });

  // ------------------------------------------------------------ 生命周期边界

  describe("生命周期边界", () => {
    it("TC-M2-PROV-011 已发布活动仍可开通账号（记录现状）", async () => {
      // 这个接口没有 requireDraft，因此发布后仍可调用。
      // 该行为可能是有意的（补开账号），此处用测试把现状固定下来，
      // 避免日后被无意改变；若团队决定加锁，本用例应改为断言 409。
      const { activityId, configVersion } = await seedActivityWithRoster("开通账号-已发布");
      await pool.query(`UPDATE activity SET lifecycle = 'PUBLISHED' WHERE id = $1`, [
        activityId,
      ]);

      // 建一个新学生并加入名单，确保有可开通对象
      await pool.query(
        `INSERT INTO student_profile (id, student_number, name, enrollment_year, major, class_name)
         VALUES (gen_random_uuid(), '20260006', '演示学生己', '2026', '软件工程', '3班')`,
      );
      await pool.query(
        `INSERT INTO participant (id, activity_id, student_profile_id, eligible)
         SELECT gen_random_uuid(), $1, id, TRUE
         FROM student_profile WHERE student_number = '20260006'`,
        [activityId],
      );

      const r = await inject({
        method: "POST",
        url: `/api/activities/${activityId}/participants/provision-accounts`,
        headers: H(T1),
      });
      expect(r.code).toBe(200);
      expect(r.data.provisionedCount).toBe(1);
      expect(r.data.identifiers).toEqual(["20260006"]);

      // 不递增 configVersion：开通账号不属于配置变更
      const { rows } = await pool.query(
        `SELECT config_version FROM activity WHERE id = $1`,
        [activityId],
      );
      expect(rows[0].config_version).toBe(configVersion);
    });

    it("TC-M2-PROV-012 空名单调用返回 0 且不报错", async () => {
      const created = await inject({
        method: "POST",
        url: "/api/activities",
        headers: H(T1),
        payload: {
          title: "开通账号-空名单",
          description: "",
          startAt: iso(3600_000),
          deadlineAt: iso(86400_000),
          maxPreferences: 3,
        },
      });
      const r = await inject({
        method: "POST",
        url: `/api/activities/${created.data.activityId}/participants/provision-accounts`,
        headers: H(T1),
      });
      expect(r.code).toBe(200);
      expect(r.data.provisionedCount).toBe(0);
      expect(r.data.identifiers).toEqual([]);
    });

    it("TC-M2-PROV-013 不存在的活动返回 404", async () => {
      const r = await inject({
        method: "POST",
        url: "/api/activities/00000000-0000-0000-0000-000000000000/participants/provision-accounts",
        headers: H(T1),
      });
      expect(r.code).toBe(404);
    });
  });
});
