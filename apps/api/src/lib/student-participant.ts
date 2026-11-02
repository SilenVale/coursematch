import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

type Db = Pool | PoolClient;

/** 学生自助参与已发布选课：不在教师导入名单时，首次填报前自动加入 participant。 */
export async function ensureStudentParticipant(
  db: Db,
  activityId: string,
  studentProfileId: string,
): Promise<string> {
  const { rows: existing } = await db.query<{ id: string }>(
    `SELECT id FROM participant
     WHERE activity_id = $1 AND student_profile_id = $2`,
    [activityId, studentProfileId],
  );
  if (existing[0]?.id) return existing[0].id;

  const id = randomUUID();
  await db.query(
    `INSERT INTO participant (id, activity_id, student_profile_id, eligible)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (activity_id, student_profile_id) DO NOTHING`,
    [id, activityId, studentProfileId],
  );

  const { rows: after } = await db.query<{ id: string }>(
    `SELECT id FROM participant
     WHERE activity_id = $1 AND student_profile_id = $2`,
    [activityId, studentProfileId],
  );
  const row = after[0];
  if (!row) {
    throw new Error("ensureStudentParticipant: insert failed");
  }
  return row.id;
}
