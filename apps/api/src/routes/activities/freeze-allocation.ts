import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type {
  AllocationView,
  FreezeFailure,
  FreezeView,
  Lifecycle,
} from "@coursematch/shared";
import { pool } from "../../db/pool.js";
import { fail, ok } from "../../lib/response.js";
import { buildPersonalRounds, runAllocation } from "./allocation-bridge.js";
import { buildFrozenInput, insertOperationLog } from "./freeze-build.js";

interface ActivityRow {
  id: string;
  owner_account_id: string;
  lifecycle: Lifecycle;
  deadline_at: Date;
  freeze_last_failure: FreezeFailure | null;
}

async function loadOwnedActivity(
  req: FastifyRequest,
  reply: FastifyReply,
  activityId: string,
): Promise<ActivityRow | null> {
  const { rows } = await pool.query<ActivityRow>(
    `SELECT id, owner_account_id, lifecycle, deadline_at, freeze_last_failure
     FROM activity WHERE id = $1`,
    [activityId],
  );
  const row = rows[0];
  if (!row || row.owner_account_id !== req.actor?.accountId) {
    const { status, body } = fail("RESOURCE_NOT_FOUND", "活动不存在", 404);
    reply.code(status).send(body);
    return null;
  }
  return row;
}

async function getFreezeView(activityId: string): Promise<FreezeView> {
  const { rows: snap } = await pool.query<{ id: string; frozen_at: Date }>(
    `SELECT id, frozen_at FROM freeze_snapshot WHERE activity_id = $1`,
    [activityId],
  );
  if (snap.length > 0) {
    return {
      preparation: "READY",
      snapshotId: snap[0].id,
      frozenAt: snap[0].frozen_at.toISOString(),
    };
  }

  const { rows: act } = await pool.query<{ freeze_last_failure: FreezeFailure | null }>(
    `SELECT freeze_last_failure FROM activity WHERE id = $1`,
    [activityId],
  );
  const last = act[0]?.freeze_last_failure;
  if (last) {
    return { preparation: "FAILED", lastFailure: last };
  }
  return { preparation: "PENDING" };
}

function batchToAllocationView(
  batch: {
    id: string;
    snapshot_id: string;
    executed_at: Date;
    counts: { assigned: number; unallocated: number; notSubmitted: number };
  },
  topics: AllocationView["topics"],
): AllocationView {
  return {
    batchId: batch.id,
    snapshotId: batch.snapshot_id,
    executedAt: batch.executed_at.toISOString(),
    counts: batch.counts,
    topics,
  };
}

export const freezeAllocationRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/freeze",
    async (req, reply) => {
      if (!req.actor) {
        const { status, body } = fail("UNAUTHENTICATED", "请先登录", 401);
        return reply.code(status).send(body);
      }
      const row = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!row) return;
      return ok(await getFreezeView(row.id));
    },
  );

  app.post<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/freeze",
    async (req, reply) => {
      if (!req.actor || req.actor.role !== "TEACHER") {
        const { status, body } = fail("ROLE_FORBIDDEN", "当前角色无权执行此操作", 403);
        return reply.code(status).send(body);
      }
      const activity = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!activity) return;

      if (activity.lifecycle === "VOID" || activity.lifecycle === "CLOSED") {
        const code = activity.lifecycle === "VOID" ? "ACTIVITY_VOID" : "ACTIVITY_CLOSED";
        const { status, body } = fail(code, "活动已结束，无法冻结", 409);
        return reply.code(status).send(body);
      }
      if (activity.lifecycle === "DRAFT") {
        const { status, body } = fail("RESOURCE_NOT_FOUND", "活动不存在", 404);
        return reply.code(status).send(body);
      }
      if (new Date() < activity.deadline_at) {
        const { status, body } = fail("NOT_STARTED", "尚未到达截止时间，暂不能冻结", 409);
        return reply.code(status).send(body);
      }

      const existing = await getFreezeView(activity.id);
      if (existing.preparation === "READY") {
        return ok(existing);
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: full } = await client.query(
          `SELECT * FROM activity WHERE id = $1 FOR UPDATE`,
          [activity.id],
        );
        const act = full[0];
        const input = await buildFrozenInput(client, act);
        const snapshotId = randomUUID();
        await client.query(
          `INSERT INTO freeze_snapshot (id, activity_id, frozen_at, input)
           VALUES ($1, $2, NOW(), $3::jsonb)`,
          [snapshotId, activity.id, JSON.stringify(input)],
        );
        await client.query(
          `UPDATE activity SET freeze_last_failure = NULL WHERE id = $1`,
          [activity.id],
        );
        await insertOperationLog(client, {
          activityId: activity.id,
          action: "FREEZE_ACTIVITY",
          actorKind: "TEACHER",
          actorAccountId: req.actor.accountId,
          outcome: "SUCCEEDED",
          snapshotId,
          safeDetails: {
            participantCount: input.participants.length,
            topicCount: input.topics.length,
          },
        });
        await client.query("COMMIT");
        const view: FreezeView = {
          preparation: "READY",
          snapshotId,
          frozenAt: new Date().toISOString(),
        };
        return ok(view);
      } catch (err) {
        await client.query("ROLLBACK");
        const operationId = randomUUID();
        const failure: FreezeFailure = {
          operationId,
          occurredAt: new Date().toISOString(),
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "冻结失败",
        };
        await pool.query(`UPDATE activity SET freeze_last_failure = $2::jsonb WHERE id = $1`, [
          activity.id,
          JSON.stringify(failure),
        ]);
        await insertOperationLog(pool, {
          activityId: activity.id,
          action: "FREEZE_ACTIVITY",
          actorKind: "TEACHER",
          actorAccountId: req.actor.accountId,
          outcome: "FAILED",
          safeDetails: { errorClass: "INTERNAL_ERROR" },
        });
        const { status, body } = fail("INTERNAL_ERROR", failure.message, 500);
        return reply.code(status).send(body);
      } finally {
        client.release();
      }
    },
  );

  app.post<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/allocation",
    async (req, reply) => {
      if (!req.actor || req.actor.role !== "TEACHER") {
        const { status, body } = fail("ROLE_FORBIDDEN", "当前角色无权执行此操作", 403);
        return reply.code(status).send(body);
      }
      const activity = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!activity) return;

      const { rows: existingBatch } = await pool.query<{
        id: string;
        snapshot_id: string;
        executed_at: Date;
        counts: AllocationView["counts"];
        topic_stats: AllocationView["topics"];
      }>(
        `SELECT id, snapshot_id, executed_at, counts, topic_stats FROM allocation_batch WHERE activity_id = $1`,
        [activity.id],
      );
      if (existingBatch.length > 0) {
        const b = existingBatch[0];
        return ok(
          batchToAllocationView(b, b.topic_stats ?? []),
        );
      }

      const freeze = await getFreezeView(activity.id);
      if (freeze.preparation !== "READY") {
        const { status, body } = fail("FREEZE_REQUIRED", "请先完成冻结快照", 409);
        return reply.code(status).send(body);
      }

      const { rows: snapRows } = await pool.query<{ input: unknown }>(
        `SELECT input FROM freeze_snapshot WHERE activity_id = $1`,
        [activity.id],
      );
      const contract = snapRows[0].input as import("@coursematch/shared").FrozenInput;
      const calculated = runAllocation(contract);
      const batchId = randomUUID();

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
          [
            batchId,
            activity.id,
            freeze.snapshotId,
            JSON.stringify(counts),
            JSON.stringify(topicStats),
          ],
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
          [activity.id],
        );

        await insertOperationLog(client, {
          activityId: activity.id,
          action: "ALLOCATE_ACTIVITY",
          actorKind: "TEACHER",
          actorAccountId: req.actor.accountId,
          outcome: "SUCCEEDED",
          snapshotId: freeze.snapshotId,
          batchId,
          safeDetails: { counts },
        });
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        const { status, body } = fail(
          "INTERNAL_ERROR",
          err instanceof Error ? err.message : "分配失败",
          500,
        );
        return reply.code(status).send(body);
      } finally {
        client.release();
      }

      const view: AllocationView = {
        batchId,
        snapshotId: freeze.snapshotId,
        executedAt: new Date().toISOString(),
        counts,
        topics: calculated.topicStats.map((t) => ({
          topicId: t.topicId,
          capacity: t.capacity,
          assignedCount: t.assignedCount,
          remainingSlots: t.remainingSlots,
        })),
      };
      return ok(view);
    },
  );
};
