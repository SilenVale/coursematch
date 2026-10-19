import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./pool.js";

const DEV_PASSWORD = "Coursematch-Dev-2026";

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);
  const teacherId = randomUUID();
  const studentA = randomUUID();
  const studentB = randomUUID();
  const profileA = randomUUID();
  const profileB = randomUUID();
  const activityDraft = randomUUID();
  const activityPublished = randomUUID();

  await pool.query("DELETE FROM participant");
  await pool.query("DELETE FROM activity");
  await pool.query("DELETE FROM session");
  await pool.query("DELETE FROM account");
  await pool.query("DELETE FROM student_profile");

  await pool.query(
    `INSERT INTO student_profile (id, student_number, name, enrollment_year, major, class_name)
     VALUES ($1, '20260001', '演示学生甲', '2026', '软件工程', '1班'),
            ($2, '20260002', '演示学生乙', '2026', '软件工程', '1班')`,
    [profileA, profileB],
  );

  await pool.query(
    `INSERT INTO account (id, identifier, role, password_hash, student_profile_id)
     VALUES ($1, 'teacher01', 'TEACHER', $2, NULL),
            ($3, '20260001', 'STUDENT', $2, $4),
            ($5, '20260002', 'STUDENT', $2, $6)`,
    [teacherId, passwordHash, randomUUID(), profileA, randomUUID(), profileB],
  );

  const start = new Date();
  const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO activity (
      id, owner_account_id, title, description, start_at, deadline_at,
      max_preferences, lifecycle, config_version, published_at
    ) VALUES
      ($1, $3, '草稿示例活动', '石俊贤实现配置流程', $4, $5, 3, 'DRAFT', 0, NULL),
      ($2, $3, '已发布示例活动', '学生可见、可开始接志愿', $4, $5, 3, 'PUBLISHED', 1, NOW())`,
    [activityDraft, activityPublished, teacherId, start, deadline],
  );

  await pool.query(
    `INSERT INTO participant (id, activity_id, student_profile_id, eligible)
     VALUES ($1, $2, $3, TRUE), ($4, $2, $5, TRUE)`,
    [randomUUID(), activityPublished, profileA, randomUUID(), profileB],
  );

  console.log("Seed complete.");
  console.log("Teacher: teacher01 /", DEV_PASSWORD);
  console.log("Students: 20260001, 20260002 /", DEV_PASSWORD);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
