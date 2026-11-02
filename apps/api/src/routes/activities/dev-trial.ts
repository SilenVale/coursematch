import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { AllocationView, Lifecycle } from "@coursematch/shared";
import { isDevToolsEnabled } from "../../lib/dev-tools.js";
import { pool } from "../../db/pool.js";
import { fail, ok } from "../../lib/response.js";
import { buildPersonalRounds, runAllocation } from "./allocation-bridge.js";
import { buildFrozenInput, insertOperationLog } from "./freeze-build.js";
import { derivePhase } from "./preferences-rules.js";
import { pickTopicId, type SimulateStrategy } from "./dev-trial-lib.js";

function devDisabled(reply: FastifyReply) {
  const { status, body } = fail("RESOURCE_NOT_FOUND", "不可用", 404);
  return reply.code(status).send(body);
}

async function loadOwnedActivity(
  req: FastifyRequest,
  reply: FastifyReply,
  activityId: string,
): Promise<{ id: string; owner_account_id: string; lifecycle: Lifecycle } | null> {
  const { rows } = await pool.query<{
    id: string;
    owner_account_id: string;
    lifecycle: Lifecycle;
  }>(`SELECT id, owner_account_id, lifecycle FROM activity WHERE id = $1`, [activityId]);
  const row = rows[0];
  if (!row || row.owner_account_id !== req.actor?.accountId) {
    const { status, body } = fail("RESOURCE_NOT_FOUND", "活动不存在", 404);
    reply.code(status).send(body);
    return null;
  }
  return row;
}

function parseStrategy(raw: unknown): SimulateStrategy {
  if (raw === "round_robin" || raw === "random") return raw;
  return "same_first";
}

async function choosableTopicIds(
  activityId: string,
  participantId: string,
): Promise<string[]> {
  const { rows } = await pool.query<{ id: string; eligibility_mode: string; eligible: boolean }>(
    `SELECT t.id, t.eligibility_mode,
            EXISTS (
              SELECT 1 FROM topic_eligible_participant e
              WHERE e.topic_id = t.id AND e.participant_id = $2
            ) AS eligible
     FROM topic t
     WHERE t.activity_id = $1
     ORDER BY t.created_at, t.title`,
    [activityId, participantId],
  );
  return rows
    .filter((t) => t.eligibility_mode === "ALL" || t.eligible)
    .map((t) => t.id);
}

export interface SimulateResult {
  writtenCount: number;
  skippedNoAccount: string[];
  skippedUnfilled: string[];
  strategy: SimulateStrategy;
}

export async function simulatePreferencesForActivity(
  activityId: string,
  strategy: SimulateStrategy,
  skipUnfilledCount: number,
): Promise<SimulateResult> {
  const { rows: noAccountRows } = await pool.query<{ student_number: string }>(
    `SELECT sp.student_number
     FROM participant p
     JOIN student_profile sp ON sp.id = p.student_profile_id
     LEFT JOIN account acc ON acc.student_profile_id = sp.id
     WHERE p.activity_id = $1 AND acc.id IS NULL
     ORDER BY sp.student_number`,
    [activityId],
  );
  const skippedNoAccount = noAccountRows.map((r) => r.student_number);

  const { rows: participants } = await pool.query<{
    participant_id: string;
    student_number: string;
  }>(
    `SELECT p.id AS participant_id, sp.student_number
     FROM participant p
     JOIN student_profile sp ON sp.id = p.student_profile_id
     JOIN account acc ON acc.student_profile_id = sp.id
     WHERE p.activity_id = $1
     ORDER BY sp.student_number`,
    [activityId],
  );

  const skipN = Math.max(0, Math.min(skipUnfilledCount, participants.length));
  const skipSet = new Set(
    participants.slice(participants.length - skipN).map((p) => p.participant_id),
  );

  const skippedUnfilled: string[] = [];
  let writtenCount = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: actRows } = await client.query<{
      start_at: Date;
      deadline_at: Date;
      lifecycle: Lifecycle;
      db_now: Date;
    }>(`SELECT *, now() AS db_now FROM activity WHERE id = $1 FOR UPDATE`, [activityId]);
    const act = actRows[0];
    if (!act) throw new Error("活动不存在");
    let phase = derivePhase(act.lifecycle, act.start_at, act.deadline_at, act.db_now);
    if (phase === "DEADLINE_REACHED" && act.lifecycle === "PUBLISHED") {
      await client.query(
        `UPDATE activity SET deadline_at = NOW() + INTERVAL '7 days' WHERE id = $1`,
        [activityId],
      );
      phase = "FILLING";
    }
    if (phase !== "FILLING") {
      throw new Error("仅填报中阶段可模拟全员填报");
    }

    for (let i = 0; i < participants.length; i += 1) {
      const row = participants[i];
      if (skipSet.has(row.participant_id)) {
        skippedUnfilled.push(row.student_number);
        continue;
      }
      const topics = await choosableTopicIds(activityId, row.participant_id);
      const topicId = pickTopicId(strategy, topics, i, row.student_number);
      if (!topicId) continue;

      const { rows: verRows } = await client.query<{ version: number }>(
        `SELECT COALESCE(MAX(version), 0)::int AS version FROM preference WHERE participant_id = $1`,
        [row.participant_id],
      );
      const nextVersion = (verRows[0]?.version ?? 0) + 1;
      await client.query(`DELETE FROM preference WHERE participant_id = $1`, [row.participant_id]);
      await client.query(
        `INSERT INTO preference
           (activity_id, participant_id, rank, topic_id, version, submitted_at)
         VALUES ($1, $2, 1, $3, $4, $5::timestamptz)`,
        [activityId, row.participant_id, topicId, nextVersion, act.db_now],
      );
      writtenCount += 1;
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }

  return {
    writtenCount,
    skippedNoAccount,
    skippedUnfilled,
    strategy,
  };
}

export async function resetTrialForActivity(activityId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ lifecycle: Lifecycle }>(
      `SELECT lifecycle FROM activity WHERE id = $1 FOR UPDATE`,
      [activityId],
    );
    const lifecycle = rows[0]?.lifecycle;
    if (!lifecycle || lifecycle === "CLOSED" || lifecycle === "VOID") {
      throw new Error("当前状态不可清空联调数据");
    }

    await client.query(`DELETE FROM preference WHERE activity_id = $1`, [activityId]);
    await client.query(`DELETE FROM preference_submission WHERE activity_id = $1`, [
      activityId,
    ]).catch(() => undefined);
    await client.query(
      `DELETE FROM allocation_result
       WHERE batch_id IN (SELECT id FROM allocation_batch WHERE activity_id = $1)`,
      [activityId],
    );
    await client.query(`DELETE FROM allocation_batch WHERE activity_id = $1`, [activityId]);
    await client.query(`DELETE FROM freeze_snapshot WHERE activity_id = $1`, [activityId]);
    await client.query(
      `UPDATE activity
       SET lifecycle = 'PUBLISHED',
           freeze_last_failure = NULL,
           deadline_at = NOW() + INTERVAL '7 days'
       WHERE id = $1 AND lifecycle IN ('PUBLISHED', 'ALLOCATED')`,
      [activityId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

async function bumpDeadlineToPast(activityId: string): Promise<boolean> {
  const { rows } = await pool.query<{ deadline_at: Date }>(
    `SELECT deadline_at FROM activity WHERE id = $1`,
    [activityId],
  );
  const deadline = rows[0]?.deadline_at;
  if (!deadline) return false;
  if (new Date() >= deadline) return false;
  await pool.query(
    `UPDATE activity SET deadline_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
    [activityId],
  );
  return true;
}

async function freezeActivityDev(
  activityId: string,
  teacherAccountId: string,
): Promise<{ snapshotId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: full } = await client.query(`SELECT * FROM activity WHERE id = $1 FOR UPDATE`, [
      activityId,
    ]);
    const act = full[0];
    if (!act) throw new Error("活动不存在");
    if (new Date() < new Date(act.deadline_at)) {
      throw new Error("尚未到达截止时间，无法冻结");
    }

    const existing = await pool.query(`SELECT id FROM freeze_snapshot WHERE activity_id = $1`, [
      activityId,
    ]);
    if (existing.rows.length > 0) {
      await client.query("COMMIT");
      return { snapshotId: existing.rows[0].id as string };
    }

    const input = await buildFrozenInput(client, act);
    const snapshotId = randomUUID();
    await client.query(
      `INSERT INTO freeze_snapshot (id, activity_id, frozen_at, input)
       VALUES ($1, $2, NOW(), $3::jsonb)`,
      [snapshotId, activityId, JSON.stringify(input)],
    );
    await client.query(`UPDATE activity SET freeze_last_failure = NULL WHERE id = $1`, [
      activityId,
    ]);
    await insertOperationLog(client, {
      activityId,
      action: "FREEZE_ACTIVITY",
      actorKind: "TEACHER",
      actorAccountId: teacherAccountId,
      outcome: "SUCCEEDED",
      snapshotId,
      safeDetails: {
        participantCount: input.participants.length,
        topicCount: input.topics.length,
        devTrial: true,
      },
    });
    await client.query("COMMIT");
    return { snapshotId };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

async function allocateActivityDev(
  activityId: string,
  teacherAccountId: string,
): Promise<AllocationView> {
  const { rows: existingBatch } = await pool.query<{
    id: string;
    snapshot_id: string;
    executed_at: Date;
    counts: AllocationView["counts"];
    topic_stats: AllocationView["topics"];
  }>(`SELECT id, snapshot_id, executed_at, counts, topic_stats FROM allocation_batch WHERE activity_id = $1`, [
    activityId,
  ]);
  if (existingBatch.length > 0) {
    const b = existingBatch[0];
    return {
      batchId: b.id,
      snapshotId: b.snapshot_id,
      executedAt: b.executed_at.toISOString(),
      counts: b.counts,
      topics: b.topic_stats ?? [],
    };
  }

  const { rows: snapRows } = await pool.query<{ id: string; input: unknown }>(
    `SELECT id, input FROM freeze_snapshot WHERE activity_id = $1`,
    [activityId],
  );
  if (snapRows.length === 0) throw new Error("请先完成冻结快照");
  const contract = snapRows[0].input as import("@coursematch/shared").FrozenInput;
  const calculated = runAllocation(contract);
  const batchId = randomUUID();
  const snapshotId = snapRows[0].id;

  const counts = {
    assigned: calculated.results.filter((r) => r.status === "ASSIGNED").length,
    unallocated: calculated.results.filter((r) => r.status === "UNALLOCATED").length,
    notSubmitted: calculated.results.filter((r) => r.status === "NOT_SUBMITTED").length,
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const topicStats = calculated.topicStats.map((t) => ({
      topicId: t.topicId,
      capacity: t.capacity,
      assignedCount: t.assignedCount,
      remainingSlots: t.remainingSlots,
    }));

    await client.query(
      `INSERT INTO allocation_batch (id, activity_id, snapshot_id, executed_at, counts, topic_stats)
       VALUES ($1, $2, $3, NOW(), $4::jsonb, $5::jsonb)`,
      [batchId, activityId, snapshotId, JSON.stringify(counts), JSON.stringify(topicStats)],
    );

    for (const r of calculated.results) {
      const rounds = buildPersonalRounds(contract, r.participantId, r);
      await client.query(
        `INSERT INTO allocation_result (
          batch_id, participant_id, status, topic_id, matched_rank, lottery_number, rounds
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [
          batchId,
          r.participantId,
          r.status,
          r.topicId,
          r.matchedRank,
          r.lotteryNumber,
          JSON.stringify(rounds),
        ],
      );
    }

    await client.query(
      `UPDATE activity SET lifecycle = 'ALLOCATED' WHERE id = $1 AND lifecycle = 'PUBLISHED'`,
      [activityId],
    );

    await insertOperationLog(client, {
      activityId,
      action: "ALLOCATE_ACTIVITY",
      actorKind: "TEACHER",
      actorAccountId: teacherAccountId,
      outcome: "SUCCEEDED",
      snapshotId,
      batchId,
      safeDetails: { counts, devTrial: true },
    });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }

  return {
    batchId,
    snapshotId,
    executedAt: new Date().toISOString(),
    counts,
    topics: calculated.topicStats.map((t) => ({
      topicId: t.topicId,
      capacity: t.capacity,
      assignedCount: t.assignedCount,
      remainingSlots: t.remainingSlots,
    })),
  };
}

export const devTrialRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/meta/features", async (_req, reply) => {
    return ok({ devTools: isDevToolsEnabled() });
  });

  app.get<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/dev/trial-preview",
    async (req, reply) => {
      if (!isDevToolsEnabled()) return devDisabled(reply);
      if (!req.actor || req.actor.role !== "TEACHER") {
        const { status, body } = fail("ROLE_FORBIDDEN", "仅教师可操作", 403);
        return reply.code(status).send(body);
      }
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return reply;

      const { rows: counts } = await pool.query<{
        participants: number;
        with_account: number;
        topics: number;
      }>(
        `SELECT
           (SELECT COUNT(*)::int FROM participant WHERE activity_id = $1) AS participants,
           (SELECT COUNT(*)::int FROM participant p
              JOIN account acc ON acc.student_profile_id = p.student_profile_id
            WHERE p.activity_id = $1) AS with_account,
           (SELECT COUNT(*)::int FROM topic WHERE activity_id = $1) AS topics`,
        [row.id],
      );
      const c = counts[0];
      return ok({
        participantCount: c?.participants ?? 0,
        accountReadyCount: c?.with_account ?? 0,
        topicCount: c?.topics ?? 0,
      });
    },
  );

  app.post<{ Params: { activityId: string }; Body: Record<string, unknown> }>(
    "/api/activities/:activityId/dev/simulate-preferences",
    async (req, reply) => {
      if (!isDevToolsEnabled()) return devDisabled(reply);
      if (!req.actor || req.actor.role !== "TEACHER") {
        const { status, body } = fail("ROLE_FORBIDDEN", "仅教师可操作", 403);
        return reply.code(status).send(body);
      }
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return reply;

      const strategy = parseStrategy(req.body?.strategy);
      const skipUnfilledCount = Number(req.body?.skipUnfilledCount ?? 0);
      try {
        const result = await simulatePreferencesForActivity(
          row.id,
          strategy,
          Number.isFinite(skipUnfilledCount) ? skipUnfilledCount : 0,
        );
        return ok(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : "模拟填报失败";
        const { status, body } = fail("INVALID_INPUT", message, 409);
        return reply.code(status).send(body);
      }
    },
  );

  app.post<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/dev/reset-trial",
    async (req, reply) => {
      if (!isDevToolsEnabled()) return devDisabled(reply);
      if (!req.actor || req.actor.role !== "TEACHER") {
        const { status, body } = fail("ROLE_FORBIDDEN", "仅教师可操作", 403);
        return reply.code(status).send(body);
      }
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return reply;

      try {
        await resetTrialForActivity(row.id);
        return ok({ reset: true as const });
      } catch (e) {
        const message = e instanceof Error ? e.message : "清空失败";
        const { status, body } = fail("INVALID_INPUT", message, 409);
        return reply.code(status).send(body);
      }
    },
  );

  app.post<{ Params: { activityId: string }; Body: Record<string, unknown> }>(
    "/api/activities/:activityId/dev/run-allocation-trial",
    async (req, reply) => {
      if (!isDevToolsEnabled()) return devDisabled(reply);
      if (!req.actor || req.actor.role !== "TEACHER") {
        const { status, body } = fail("ROLE_FORBIDDEN", "仅教师可操作", 403);
        return reply.code(status).send(body);
      }
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return reply;

      const body = req.body ?? {};
      const steps = {
        simulate: body.simulate !== false,
        deadline: body.deadline !== false,
        freeze: body.freeze !== false,
        allocate: body.allocate !== false,
      };
      const strategy = parseStrategy(body.strategy);
      const skipUnfilledCount = Number(body.skipUnfilledCount ?? 0);

      const log: { step: string; ok: boolean; detail?: unknown }[] = [];

      try {
        if (steps.simulate) {
          const sim = await simulatePreferencesForActivity(
            row.id,
            strategy,
            Number.isFinite(skipUnfilledCount) ? skipUnfilledCount : 0,
          );
          log.push({ step: "simulate", ok: true, detail: sim });
        }

        if (steps.deadline) {
          const bumped = await bumpDeadlineToPast(row.id);
          log.push({ step: "deadline", ok: true, detail: { adjusted: bumped } });
        }

        if (steps.freeze) {
          const fr = await freezeActivityDev(row.id, req.actor.accountId);
          log.push({ step: "freeze", ok: true, detail: fr });
        }

        if (steps.allocate) {
          const alloc = await allocateActivityDev(row.id, req.actor.accountId);
          log.push({ step: "allocate", ok: true, detail: { counts: alloc.counts } });
          return ok({ steps: log, allocation: alloc });
        }

        return ok({ steps: log, allocation: null });
      } catch (e) {
        const message = e instanceof Error ? e.message : "联调流水线失败";
        const failedStep = log.length > 0 ? log[log.length - 1]?.step : "unknown";
        return reply.code(409).send({
          error: { code: "INVALID_INPUT", message: `${failedStep}: ${message}` },
          data: { steps: log },
          serverTime: new Date().toISOString(),
        });
      }
    },
  );
};
