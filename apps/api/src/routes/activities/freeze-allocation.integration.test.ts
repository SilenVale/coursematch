import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ActorView, FrozenInput, TeacherResultsView } from "@coursematch/shared";
import Fastify from "fastify";
import { newDb } from "pg-mem";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ids = {
  teacher: "00000000-0000-4000-8000-000000000001",
  readyActivity: "00000000-0000-4000-8000-000000000002",
  earlyActivity: "00000000-0000-4000-8000-000000000003",
  topicJia: "00000000-0000-4000-8000-000000000004",
  topicYi: "00000000-0000-4000-8000-000000000005",
  profiles: [
    "00000000-0000-4000-8000-000000000011",
    "00000000-0000-4000-8000-000000000012",
    "00000000-0000-4000-8000-000000000013",
    "00000000-0000-4000-8000-000000000014",
  ],
  participants: [
    "00000000-0000-4000-8000-000000000021",
    "00000000-0000-4000-8000-000000000022",
    "00000000-0000-4000-8000-000000000023",
    "00000000-0000-4000-8000-000000000024",
  ],
};

const memory = newDb({ autoCreateForeignKeyIndices: true });
const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "../../db/migrations");
for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
  memory.public.none(readFileSync(join(migrationsDirectory, filename), "utf8"));
}
const adapter = memory.adapters.createPg();
const testPool = new adapter.Pool();

vi.mock("../../db/pool.js", () => ({ pool: testPool }));

const teacher: ActorView = {
  accountId: ids.teacher,
  role: "TEACHER",
  displayName: "teacher_ready",
};
const students: ActorView[] = ids.profiles.map((profileId, index) => ({
  accountId: `00000000-0000-4000-8000-00000000004${index + 1}`,
  role: "STUDENT" as const,
  displayName: `学生${String.fromCharCode(65 + index)}`,
  studentProfileId: profileId,
  studentNumber: `2026000${index + 1}`,
}));

const app = Fastify();

async function seedM4M5Cases() {
  await testPool.query(
    `INSERT INTO account (id, identifier, role, password_hash)
     VALUES ($1, 'teacher_ready', 'TEACHER', 'test-only')`,
    [ids.teacher],
  );
  for (let index = 0; index < students.length; index += 1) {
    await testPool.query(
      `INSERT INTO student_profile (
         id, student_number, name, enrollment_year, major, class_name
       ) VALUES ($1, $2, $3, '2026', '软件工程', '测试班')`,
      [ids.profiles[index], students[index].studentNumber, students[index].displayName],
    );
    await testPool.query(
      `INSERT INTO account (id, identifier, role, password_hash, student_profile_id)
       VALUES ($1, $2, 'STUDENT', 'test-only', $3)`,
      [students[index].accountId, students[index].studentNumber, ids.profiles[index]],
    );
  }

  await testPool.query(
    `INSERT INTO activity (
       id, owner_account_id, title, description, start_at, deadline_at,
       max_preferences, lifecycle, config_version, published_at
     ) VALUES
       ($1, $3, 'M4/M5 已截止测试', '固定混合提交场', NOW() - INTERVAL '2 hours',
        NOW() - INTERVAL '1 hour', 3, 'PUBLISHED', 1, NOW()),
       ($2, $3, 'M4/M5 截止前测试', '边界场', NOW() - INTERVAL '1 hour',
        NOW() + INTERVAL '1 hour', 3, 'PUBLISHED', 1, NOW())`,
    [ids.readyActivity, ids.earlyActivity, ids.teacher],
  );

  for (let index = 0; index < ids.participants.length; index += 1) {
    await testPool.query(
      `INSERT INTO participant (id, activity_id, student_profile_id, eligible)
       VALUES ($1, $2, $3, TRUE)`,
      [ids.participants[index], ids.readyActivity, ids.profiles[index]],
    );
  }
  await testPool.query(
    `INSERT INTO participant (id, activity_id, student_profile_id, eligible)
     VALUES ('00000000-0000-4000-8000-000000000025', $1, $2, TRUE)`,
    [ids.earlyActivity, ids.profiles[0]],
  );
  await testPool.query(
    `INSERT INTO topic (
       id, activity_id, title, capacity, eligibility_mode, eligibility_description
     ) VALUES
       ($1, $3, '甲', 1, 'ALL', '全员可选'),
       ($2, $3, '乙', 1, 'ALL', '全员可选'),
       ('00000000-0000-4000-8000-000000000006', $4, '边界题目', 1, 'ALL', '全员可选')`,
    [ids.topicJia, ids.topicYi, ids.readyActivity, ids.earlyActivity],
  );

  await testPool.query(
    `INSERT INTO preference (
       activity_id, participant_id, rank, topic_id, version, submitted_at
     ) VALUES
       ($1, $2, 1, $5, 1, NOW()),
       ($1, $3, 1, $6, 1, NOW()),
       ($1, $3, 2, $5, 1, NOW()),
       ($1, $4, 1, $6, 1, NOW())`,
    [
      ids.readyActivity,
      ids.participants[0],
      ids.participants[1],
      ids.participants[2],
      ids.topicJia,
      ids.topicYi,
    ],
  );
}

beforeAll(async () => {
  await seedM4M5Cases();
  app.decorateRequest("actor", null);
  app.addHook("preHandler", async (request) => {
    const actorHeader = request.headers["x-test-actor"];
    if (actorHeader === "student-a") request.actor = students[0];
    else if (actorHeader === "student-b") request.actor = students[1];
    else request.actor = teacher;
  });
  const { freezeAllocationRoutes } = await import("./freeze-allocation.js");
  const { activityResultsRoutes } = await import("./results.js");
  await app.register(freezeAllocationRoutes);
  await app.register(activityResultsRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await testPool.end();
});

describe.sequential("M4/M5 冻结、主分配和结果一致性", () => {
  it("截止前拒绝冻结、无 READY 快照拒绝分配，学生写操作为 403", async () => {
    const earlyFreeze = await app.inject({
      method: "POST",
      url: `/api/activities/${ids.earlyActivity}/freeze`,
    });
    expect(earlyFreeze.statusCode).toBe(409);
    expect(earlyFreeze.json().error.code).toBe("NOT_STARTED");

    const noSnapshot = await app.inject({
      method: "POST",
      url: `/api/activities/${ids.earlyActivity}/allocation`,
    });
    expect(noSnapshot.statusCode).toBe(409);
    expect(noSnapshot.json().error.code).toBe("FREEZE_REQUIRED");

    for (const route of ["freeze", "allocation"]) {
      const forbidden = await app.inject({
        method: "POST",
        url: `/api/activities/${ids.readyActivity}/${route}`,
        headers: { "x-test-actor": "student-a" },
      });
      expect(forbidden.statusCode, route).toBe(403);
      expect(forbidden.json().error.code, route).toBe("ROLE_FORBIDDEN");
    }
  });

  it("冻结生成完整快照和唯一 lottery，重复主分配返回同一 batch", async () => {
    const firstFreeze = await app.inject({
      method: "POST",
      url: `/api/activities/${ids.readyActivity}/freeze`,
    });
    expect(firstFreeze.statusCode).toBe(200);
    expect(firstFreeze.json().data.preparation).toBe("READY");

    const secondFreeze = await app.inject({
      method: "POST",
      url: `/api/activities/${ids.readyActivity}/freeze`,
    });
    expect(secondFreeze.json().data.snapshotId).toBe(firstFreeze.json().data.snapshotId);

    const snapshotQuery = await testPool.query(
      "SELECT input FROM freeze_snapshot WHERE activity_id = $1",
      [ids.readyActivity],
    );
    const frozen = (snapshotQuery.rows as { input: FrozenInput }[])[0].input;
    expect(frozen.participants).toHaveLength(4);
    expect(frozen.topics).toHaveLength(2);
    expect(frozen.submissions).toHaveLength(3);
    expect(new Set(frozen.participants.map((item) => item.lotteryNumber)).size).toBe(4);
    expect(frozen.participants.map((item) => item.lotteryNumber).sort()).toEqual([1, 2, 3, 4]);

    const firstAllocation = await app.inject({
      method: "POST",
      url: `/api/activities/${ids.readyActivity}/allocation`,
    });
    expect(firstAllocation.statusCode).toBe(200);
    expect(firstAllocation.json().data.counts).toEqual({
      assigned: 2,
      unallocated: 1,
      notSubmitted: 1,
    });

    const secondAllocation = await app.inject({
      method: "POST",
      url: `/api/activities/${ids.readyActivity}/allocation`,
    });
    expect(secondAllocation.statusCode).toBe(200);
    expect(secondAllocation.json().data.batchId).toBe(firstAllocation.json().data.batchId);
    const batchQuery = await testPool.query(
      "SELECT COUNT(*)::int AS count FROM allocation_batch WHERE activity_id = $1",
      [ids.readyActivity],
    );
    const batches = batchQuery.rows as { count: number }[];
    expect(batches[0].count).toBe(1);
  });

  it("教师汇总与学生我的结果逐字段一致，且证据关联同一快照和批次", async () => {
    const teacherResponse = await app.inject({
      method: "GET",
      url: `/api/activities/${ids.readyActivity}/results`,
    });
    expect(teacherResponse.statusCode).toBe(200);
    const teacherResults = teacherResponse.json().data as TeacherResultsView;
    expect(teacherResults.preparation).toBe("READY");
    if (teacherResults.preparation !== "READY") throw new Error("教师结果未准备好");

    const snapshotQuery = await testPool.query(
      "SELECT input FROM freeze_snapshot WHERE activity_id = $1",
      [ids.readyActivity],
    );
    const snapshotRows = snapshotQuery.rows as { input: FrozenInput }[];
    const lotteryByParticipant = new Map<string, number>(
      snapshotRows[0].input.participants.map((item) => [item.participantId, item.lotteryNumber]),
    );
    const yiCandidates = [ids.participants[1], ids.participants[2]].sort(
      (left, right) => lotteryByParticipant.get(left)! - lotteryByParticipant.get(right)!,
    );
    const resultByParticipant = new Map(
      teacherResults.items.map((item) => [item.participantId, item]),
    );
    expect(resultByParticipant.get(ids.participants[0])).toMatchObject({
      status: "ASSIGNED",
      topicId: ids.topicJia,
      matchedRank: 1,
    });
    expect(resultByParticipant.get(yiCandidates[0])).toMatchObject({
      status: "ASSIGNED",
      topicId: ids.topicYi,
      matchedRank: 1,
    });
    expect(resultByParticipant.get(yiCandidates[1])).toMatchObject({
      status: "UNALLOCATED",
      topicId: null,
    });
    expect(resultByParticipant.get(ids.participants[3])).toMatchObject({
      status: "NOT_SUBMITTED",
      topicId: null,
    });

    for (const [header, participantId] of [
      ["student-a", ids.participants[0]],
      ["student-b", ids.participants[1]],
    ] as const) {
      const studentResponse = await app.inject({
        method: "GET",
        url: `/api/activities/${ids.readyActivity}/results/me`,
        headers: { "x-test-actor": header },
      });
      expect(studentResponse.statusCode).toBe(200);
      const personal = studentResponse.json().data;
      const teacherItem = teacherResults.items.find((item) => item.participantId === participantId);
      expect(teacherItem).toBeDefined();
      expect(personal).toMatchObject({
        preparation: "READY",
        status: teacherItem!.status,
        topicId: teacherItem!.topicId,
        matchedRank: teacherItem!.matchedRank,
        lotteryNumber: teacherItem!.lotteryNumber,
        rounds: teacherItem!.rounds,
      });
    }

    const evidenceResponse = await app.inject({
      method: "GET",
      url: `/api/activities/${ids.readyActivity}/evidence`,
    });
    expect(evidenceResponse.statusCode).toBe(200);
    const evidence = evidenceResponse.json().data;
    expect(evidence.snapshot.id).toBe(teacherResults.snapshotId);
    expect(evidence.batch.id).toBe(teacherResults.batchId);
    expect(
      evidence.operations.some(
        (operation: { action: string; outcome: string }) =>
          operation.action === "ALLOCATE_ACTIVITY" && operation.outcome === "SUCCEEDED",
      ),
    ).toBe(true);
  });
});
