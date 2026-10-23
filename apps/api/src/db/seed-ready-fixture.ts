import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { SeedAccountsResult } from "./seed-shared.js";

/** 为 teacher_ready 写入两条选课任务：一条选课中、一条已截止（含题目与志愿）。 */
export async function seedReadyFixture(
  pool: Pool,
  accounts: Pick<SeedAccountsResult, "teacherReadyId" | "profileA" | "profileB">,
): Promise<void> {
  const { teacherReadyId, profileA, profileB } = accounts;
  const activityPublished = randomUUID();
  const activityClosed = randomUUID();
  const partPubA = randomUUID();
  const partPubB = randomUUID();
  const topicA = randomUUID();
  const topicB = randomUUID();

  const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const deadlineFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const deadlinePast = new Date(Date.now() - 2 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO activity (
      id, owner_account_id, title, description, start_at, deadline_at,
      max_preferences, lifecycle, config_version, published_at
    ) VALUES
      ($1, $3, '2026春 方向选择（选课中）', '学生可登录填报有序志愿', $4, $5, 3, 'PUBLISHED', 1, NOW()),
      ($2, $3, '2026春 毕设选题（已截止）', '可冻结并执行主分配', $4, $6, 3, 'PUBLISHED', 2, NOW())`,
    [activityPublished, activityClosed, teacherReadyId, start, deadlineFuture, deadlinePast],
  );

  for (const activityId of [activityPublished, activityClosed]) {
    await pool.query(
      `INSERT INTO participant (id, activity_id, student_profile_id, eligible)
       VALUES ($1, $2, $3, TRUE), ($4, $2, $5, TRUE)`,
      [randomUUID(), activityId, profileA, randomUUID(), profileB],
    );
  }

  await pool.query(
    `INSERT INTO topic (id, activity_id, title, description, tags, capacity, eligibility_mode, eligibility_description)
     VALUES ($1, $2, '方向甲', '', '{}', 1, 'ALL', ''),
            ($3, $2, '方向乙', '', '{}', 1, 'ALL', '')`,
    [topicA, activityClosed, topicB],
  );

  const { rows: closedParts } = await pool.query<{ id: string }>(
    `SELECT p.id FROM participant p WHERE p.activity_id = $1 ORDER BY p.id`,
    [activityClosed],
  );
  const closedPartA = closedParts[0].id;
  const closedPartB = closedParts[1].id;

  await pool.query(
    `INSERT INTO preference (activity_id, participant_id, rank, topic_id, version, submitted_at)
     VALUES ($1, $2, 1, $3, 1, NOW()),
            ($1, $4, 1, $5, 1, NOW()),
            ($1, $4, 2, $3, 1, NOW())`,
    [activityClosed, closedPartA, topicA, closedPartB, topicB],
  );
}
