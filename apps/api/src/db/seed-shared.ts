import type { Pool } from "pg";
import bcrypt from "bcryptjs";

export const DEV_PASSWORD = "Coursematch-Dev-2026";

export async function hashDevPassword(): Promise<string> {
  return bcrypt.hash(DEV_PASSWORD, 12);
}

/** 全量 seed 前清空业务数据（开发/演示库专用，勿指向生产用户库）。 */
export async function clearAllSeedData(pool: Pool): Promise<void> {
  await pool.query("DELETE FROM assistant_teacher_session");
  await pool.query("DELETE FROM assistant_site_llm");
  await pool.query("DELETE FROM operation_log");
  await pool.query("DELETE FROM allocation_result");
  await pool.query("DELETE FROM allocation_batch");
  await pool.query("DELETE FROM freeze_snapshot");
  await pool.query("DELETE FROM preference");
  await pool.query("DELETE FROM preference_submission");
  await pool.query("DELETE FROM topic_eligible_participant");
  await pool.query("DELETE FROM topic");
  await pool.query("DELETE FROM course_catalog");
  await pool.query("DELETE FROM participant");
  await pool.query("DELETE FROM activity");
  await pool.query("DELETE FROM session");
  await pool.query("DELETE FROM account");
  await pool.query("DELETE FROM student_profile");
}

export type SeedAccountsResult = {
  teacherBlankId: string;
  teacherReadyId: string;
  teacherLegacyId: string;
  profileA: string;
  profileB: string;
};

export async function seedAccounts(
  pool: Pool,
  passwordHash: string,
): Promise<SeedAccountsResult> {
  const { randomUUID } = await import("node:crypto");
  const teacherBlankId = randomUUID();
  const teacherReadyId = randomUUID();
  const teacherLegacyId = randomUUID();
  const studentA = randomUUID();
  const studentB = randomUUID();
  const studentDemo1 = randomUUID();
  const studentDemo2 = randomUUID();
  const teacherMrZhang = randomUUID();
  const teacherMrLi = randomUUID();
  const profileA = randomUUID();
  const profileB = randomUUID();
  const profileDemo1 = randomUUID();
  const profileDemo2 = randomUUID();

  await pool.query(
    `INSERT INTO student_profile (id, student_number, name, enrollment_year, major, class_name)
     VALUES ($1, '20260001', '学生甲', '2026', '软件工程', '1班'),
            ($2, '20260002', '学生乙', '2026', '软件工程', '1班'),
            ($3, '20262001', '演示生·已报上', '2026', '软件工程', '1班'),
            ($4, '20262099', '演示生·未报上', '2026', '软件工程', '1班')`,
    [profileA, profileB, profileDemo1, profileDemo2],
  );

  await pool.query(
    `INSERT INTO account (id, identifier, role, password_hash, student_profile_id)
     VALUES ($1, 'teacher_blank', 'TEACHER', $2, NULL),
            ($3, 'teacher_ready', 'TEACHER', $2, NULL),
            ($4, 'teacher01', 'TEACHER', $2, NULL),
            ($5, 'mr_zhang', 'TEACHER', $2, NULL),
            ($6, 'mr_li', 'TEACHER', $2, NULL),
            ($7, '20260001', 'STUDENT', $2, $8),
            ($9, '20260002', 'STUDENT', $2, $10),
            ($11, '20262001', 'STUDENT', $2, $12),
            ($13, '20262099', 'STUDENT', $2, $14)`,
    [
      teacherBlankId,
      passwordHash,
      teacherReadyId,
      teacherLegacyId,
      teacherMrZhang,
      teacherMrLi,
      studentA,
      profileA,
      studentB,
      profileB,
      studentDemo1,
      profileDemo1,
      studentDemo2,
      profileDemo2,
    ],
  );

  return {
    teacherBlankId,
    teacherReadyId,
    teacherLegacyId,
    profileA,
    profileB,
  };
}
