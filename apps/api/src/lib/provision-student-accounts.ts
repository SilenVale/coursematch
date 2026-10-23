import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Pool } from "pg";

const DEFAULT_PASSWORD = process.env.STUDENT_DEFAULT_PASSWORD ?? "Coursematch-Dev-2026";

/** 为本活动中尚未建号的学生档案创建登录账号（identifier = 学号）。 */
export async function provisionAccountsForActivity(
  pool: Pool,
  activityId: string,
): Promise<{ provisionedCount: number; identifiers: string[] }> {
  const { rows } = await pool.query<{ student_number: string; profile_id: string }>(
    `SELECT sp.id AS profile_id, sp.student_number
     FROM participant p
     JOIN student_profile sp ON sp.id = p.student_profile_id
     LEFT JOIN account acc ON acc.student_profile_id = sp.id
     WHERE p.activity_id = $1 AND acc.id IS NULL
     ORDER BY sp.student_number`,
    [activityId],
  );

  if (rows.length === 0) {
    return { provisionedCount: 0, identifiers: [] };
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  const identifiers: string[] = [];

  for (const row of rows) {
    await pool.query(
      `INSERT INTO account (id, identifier, role, password_hash, student_profile_id)
       VALUES ($1, $2, 'STUDENT', $3, $4)`,
      [randomUUID(), row.student_number, passwordHash, row.profile_id],
    );
    identifiers.push(row.student_number);
  }

  return { provisionedCount: identifiers.length, identifiers };
}
