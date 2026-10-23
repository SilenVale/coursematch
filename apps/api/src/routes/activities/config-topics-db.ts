/**
 * 石俊贤 · M2 题目配置的数据库操作。
 *
 * 与 `config-topics.ts`（纯校验/映射，可单测）分开：本文件 import 了 pool，
 * 在缺少 DATABASE_URL 时会在导入阶段抛错，所以不能混进纯函数测试。
 */
import type { FieldError } from "@coursematch/shared";
import { pool } from "../../db/pool.js";
import { fail } from "../../lib/response.js";
import type { TopicRow } from "./config-topics.js";

/** 活动状态：只有草稿能改题目与名单。 */
export function requireDraft(
  row: { lifecycle: string },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
): boolean {
  if (row.lifecycle === "DRAFT") return true;
  const { status, body } = fail(
    "CONFIG_LOCKED",
    "活动已发布或已结束，题目与名单不能再修改",
    409,
  );
  reply.code(status).send(body);
  return false;
}

/** 读题目并确认属于该活动；不存在按 404 处理。 */
export async function loadTopic(
  activityId: string,
  topicId: string,
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
): Promise<TopicRow | null> {
  const { rows } = await pool.query<TopicRow>(
    `SELECT * FROM topic WHERE id = $1 AND activity_id = $2`,
    [topicId, activityId],
  );
  if (rows.length === 0) {
    const { status, body } = fail("RESOURCE_NOT_FOUND", "题目不存在", 404);
    reply.code(status).send(body);
    return null;
  }
  return rows[0];
}

/** 批量取题目的限定名单，避免 N+1。 */
export async function loadEligibleParticipantIds(
  topicIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (topicIds.length === 0) return map;
  const { rows } = await pool.query<{ topic_id: string; participant_id: string }>(
    `SELECT topic_id, participant_id
     FROM topic_eligible_participant
     WHERE topic_id = ANY($1::uuid[])`,
    [topicIds],
  );
  for (const row of rows) {
    const list = map.get(row.topic_id);
    if (list) list.push(row.participant_id);
    else map.set(row.topic_id, [row.participant_id]);
  }
  return map;
}

/** 限定名单里的 participantId 必须属于本活动。 */
export async function validateEligibleIds(
  activityId: string,
  ids: string[],
): Promise<FieldError[]> {
  if (ids.length === 0) return [];
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM participant WHERE activity_id = $1 AND id = ANY($2::uuid[])`,
    [activityId, ids],
  );
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length === 0) return [];
  return [
    {
      field: "eligibleParticipantIds",
      code: "INVALID_FORMAT",
      message: `${missing.length} 个学生不在本活动名单中，请重新导入名单后再选择`,
    },
  ];
}

/** 发布前齐备性检查（V1 优秀线第 5 条：未齐备不能发布）。 */
export async function publishBlockers(row: {
  id: string;
  title: string;
  start_at: Date | string;
  deadline_at: Date | string;
  max_preferences: number;
}): Promise<FieldError[]> {
  const blockers: FieldError[] = [];

  if (row.title.trim() === "") {
    blockers.push({ field: "title", code: "REQUIRED", message: "活动名称未填写" });
  }
  if (new Date(row.start_at) >= new Date(row.deadline_at)) {
    blockers.push({
      field: "deadlineAt",
      code: "OUT_OF_RANGE",
      message: "截止时间必须晚于开始时间",
    });
  }
  if (row.max_preferences < 1 || row.max_preferences > 3) {
    blockers.push({
      field: "maxPreferences",
      code: "OUT_OF_RANGE",
      message: "最大志愿数必须是 1～3",
    });
  }

  const { rows: participantRows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM participant WHERE activity_id = $1`,
    [row.id],
  );
  if (participantRows[0].count === 0) {
    blockers.push({
      field: "participants",
      code: "REQUIRED",
      message: "参与名单为空，发布后没有学生能选择本活动",
    });
  }

  const { rows: topicRows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM topic WHERE activity_id = $1`,
    [row.id],
  );
  if (topicRows[0].count === 0) {
    blockers.push({
      field: "topics",
      code: "REQUIRED",
      message: "至少需要配置一个题目",
    });
  }

  // 限定名单引用的是 participant.id；名单整份替换后旧 id 会消失，
  // 这里兜底检查，避免发布出一个「限定名单为空」的题目。
  const { rows: brokenRows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM topic t
     WHERE t.activity_id = $1
       AND t.eligibility_mode = 'EXPLICIT'
       AND NOT EXISTS (
         SELECT 1 FROM topic_eligible_participant e WHERE e.topic_id = t.id
       )`,
    [row.id],
  );
  if (brokenRows[0].count > 0) {
    blockers.push({
      field: "topics",
      code: "INVALID_FORMAT",
      message: `有 ${brokenRows[0].count} 个题目的限定名单为空（名单替换后旧引用失效），请重新指定`,
    });
  }

  return blockers;
}
