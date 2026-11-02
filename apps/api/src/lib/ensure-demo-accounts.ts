import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { DEV_PASSWORD, hashDevPassword } from "../db/seed-shared.js";

const DEMO_STUDENTS: { studentNumber: string; name: string }[] = [
  { studentNumber: "20262001", name: "演示生·已报上" },
  { studentNumber: "20262099", name: "演示生·未报上" },
];

const DEMO_TEACHERS = ["mr_zhang", "mr_li"] as const;

/** Dev：幂等补全演示账号，不删已有业务数据。 */
export async function ensureDemoAccounts(): Promise<void> {
  const passwordHash = await hashDevPassword();

  for (const id of DEMO_TEACHERS) {
    const { rows } = await pool.query(`SELECT id FROM account WHERE identifier = $1`, [id]);
    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO account (id, identifier, role, password_hash, student_profile_id)
         VALUES ($1, $2, 'TEACHER', $3, NULL)`,
        [randomUUID(), id, passwordHash],
      );
    }
  }

  for (const s of DEMO_STUDENTS) {
    let profileId: string;
    const { rows: prof } = await pool.query<{ id: string }>(
      `SELECT id FROM student_profile WHERE student_number = $1`,
      [s.studentNumber],
    );
    if (prof[0]) {
      profileId = prof[0].id;
    } else {
      profileId = randomUUID();
      await pool.query(
        `INSERT INTO student_profile (id, student_number, name, enrollment_year, major, class_name)
         VALUES ($1, $2, $3, '2026', '软件工程', '1班')`,
        [profileId, s.studentNumber, s.name],
      );
    }

    const { rows: acc } = await pool.query(`SELECT id FROM account WHERE identifier = $1`, [
      s.studentNumber,
    ]);
    if (acc.length === 0) {
      await pool.query(
        `INSERT INTO account (id, identifier, role, password_hash, student_profile_id)
         VALUES ($1, $2, 'STUDENT', $3, $4)`,
        [randomUUID(), s.studentNumber, passwordHash, profileId],
      );
    }
  }
}

export function demoAccountPasswordHint(): string {
  return DEV_PASSWORD;
}
