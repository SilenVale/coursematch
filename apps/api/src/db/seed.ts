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
  const activityClosedDemo = randomUUID();
  const partA = randomUUID();
  const partB = randomUUID();
  const topicJia = randomUUID();
  const topicYi = randomUUID();

  await pool.query("DELETE FROM operation_log");
  await pool.query("DELETE FROM allocation_result");
  await pool.query("DELETE FROM allocation_batch");
  await pool.query("DELETE FROM freeze_snapshot");
  await pool.query("DELETE FROM preference");
  await pool.query("DELETE FROM preference_submission");
  await pool.query("DELETE FROM topic_eligible_participant");
  await pool.query("DELETE FROM topic");
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
    [teacherId, passwordHash, studentA, profileA, studentB, profileB],
  );

  const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const deadlineFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const deadlinePast = new Date(Date.now() - 2 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO activity (
      id, owner_account_id, title, description, start_at, deadline_at,
      max_preferences, lifecycle, config_version, published_at
    ) VALUES
      ($1, $4, '草稿示例活动', '石俊贤实现配置流程', $5, $6, 3, 'DRAFT', 0, NULL),
      ($2, $4, '已发布示例活动', '学生可见、可开始接志愿', $5, $6, 3, 'PUBLISHED', 1, NOW()),
      ($3, $4, '截止联调示例（可冻结分配）', '已截止，含题目与种子志愿', $5, $7, 3, 'PUBLISHED', 2, NOW())`,
    [activityDraft, activityPublished, activityClosedDemo, teacherId, start, deadlineFuture, deadlinePast],
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

  const { rows: closedParts } = await pool.query<{ id: string; student_number: string }>(
    `SELECT p.id, sp.student_number
     FROM participant p
     JOIN student_profile sp ON sp.id = p.student_profile_id
     WHERE p.activity_id = $1
     ORDER BY sp.student_number`,
    [activityClosedDemo],
  );
  const closedPartA = closedParts[0].id;
  const closedPartB = closedParts[1].id;

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
    [activityClosedDemo, closedPartA, topicJia, closedPartB, topicYi],
  );

  console.log("Seed complete.");
  console.log("Teacher: teacher01 /", DEV_PASSWORD);
  console.log("Students: 20260001, 20260002 /", DEV_PASSWORD);
  console.log("Freeze demo activity id:", activityClosedDemo);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
