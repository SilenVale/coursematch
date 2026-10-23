import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { SeedAccountsResult } from "./seed-shared.js";

/** 兼容本地联调：teacher01 保留原三条示例活动。 */
export async function seedLegacyTeacher01Fixture(
  pool: Pool,
  accounts: Pick<SeedAccountsResult, "teacherLegacyId" | "profileA" | "profileB">,
): Promise<void> {
  const { teacherLegacyId, profileA, profileB } = accounts;
  const activityDraft = randomUUID();
  const activityPublished = randomUUID();
  const activityClosedDemo = randomUUID();
  const partA = randomUUID();
  const partB = randomUUID();
  const topicJia = randomUUID();
  const topicYi = randomUUID();

  const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const deadlineFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const deadlinePast = new Date(Date.now() - 2 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO activity (
      id, owner_account_id, title, description, start_at, deadline_at,
      max_preferences, lifecycle, config_version, published_at
    ) VALUES
      ($1, $4, '草稿示例活动', '配置流程演示', $5, $6, 3, 'DRAFT', 0, NULL),
      ($2, $4, '已发布示例活动', '学生可见、可填志愿', $5, $6, 3, 'PUBLISHED', 1, NOW()),
      ($3, $4, '截止联调示例（可冻结分配）', '已截止，含题目与种子志愿', $5, $7, 3, 'PUBLISHED', 2, NOW())`,
    [activityDraft, activityPublished, activityClosedDemo, teacherLegacyId, start, deadlineFuture, deadlinePast],
  );

  await pool.query(
    `INSERT INTO participant (id, activity_id, student_profile_id, eligible)
     VALUES ($1, $2, $3, TRUE), ($4, $2, $5, TRUE)`,
    [partA, activityPublished, profileA, partB, profileB],
  );

  await pool.query(
    `INSERT INTO participant (id, activity_id, student_profile_id, eligible)
     VALUES ($1, $2, $3, TRUE), ($4, $2, $5, TRUE)`,
    [randomUUID(), activityClosedDemo, profileA, randomUUID(), profileB],
  );

  const { rows: closedParts } = await pool.query<{ id: string }>(
    `SELECT p.id FROM participant p WHERE p.activity_id = $1 ORDER BY p.id`,
    [activityClosedDemo],
  );

  await pool.query(
    `INSERT INTO topic (id, activity_id, title, description, tags, capacity, eligibility_mode, eligibility_description)
     VALUES ($1, $2, '题目甲', '固定样例甲', '{}', 1, 'ALL', ''),
            ($3, $2, '题目乙', '固定样例乙', '{}', 1, 'ALL', '')`,
    [topicJia, activityClosedDemo, topicYi],
  );

  await pool.query(
    `INSERT INTO preference (activity_id, participant_id, rank, topic_id, version, submitted_at)
     VALUES ($1, $2, 1, $3, 1, NOW()),
            ($1, $4, 1, $5, 1, NOW()),
            ($1, $4, 2, $3, 1, NOW())`,
    [activityClosedDemo, closedParts[0].id, topicJia, closedParts[1].id, topicYi],
  );
}
