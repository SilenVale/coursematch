import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type {
  AllocationView,
  CloseView,
  EvidenceView,
  FrozenInput,
  Lifecycle,
  OperationAction,
  OperationEvidence,
  ReasonInput,
  ResultFields,
  TeacherResultView,
  TeacherResultsView,
} from "@coursematch/shared";
import { pool } from "../../db/pool.js";
import { fail, ok } from "../../lib/response.js";
import { insertOperationLog } from "./freeze-build.js";

interface ActivityRow {
  id: string;
  owner_account_id: string;
  lifecycle: Lifecycle;
}

async function loadOwnedActivity(
  req: FastifyRequest,
  reply: FastifyReply,
  activityId: string,
): Promise<ActivityRow | null> {
  const { rows } = await pool.query<ActivityRow>(
    `SELECT id, owner_account_id, lifecycle FROM activity WHERE id = $1`,
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

async function loadAllocationView(activityId: string): Promise<AllocationView | null> {
  const { rows } = await pool.query<{
    id: string;
    snapshot_id: string;
    executed_at: Date;
    counts: AllocationView["counts"];
    topic_stats: AllocationView["topics"];
  }>(`SELECT id, snapshot_id, executed_at, counts, topic_stats FROM allocation_batch WHERE activity_id = $1`, [
    activityId,
  ]);
  if (rows.length === 0) return null;
  const b = rows[0];
  return {
    batchId: b.id,
    snapshotId: b.snapshot_id,
    executedAt: b.executed_at.toISOString(),
    counts: b.counts,
    topics: b.topic_stats ?? [],
  };
}

export const activityResultsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/results/me",
    async (_req, reply) => {
      const { status, body } = fail(
        "INTERNAL_ERROR",
        "学生本人结果由刘家铭实现，见 docs/roles/刘家铭-M3-志愿与学生结果.md",
        501,
      );
      return reply.code(status).send(body);
    },
  );

  app.get<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/results",
    async (req, reply) => {
      if (!req.actor || req.actor.role !== "TEACHER") {
        const { status, body } = fail("ROLE_FORBIDDEN", "当前角色无权执行此操作", 403);
        return reply.code(status).send(body);
      }
      const activity = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!activity) return;

      const allocation = await loadAllocationView(activity.id);
      if (!allocation) {
        const pending: TeacherResultsView = { preparation: "PENDING" };
        return ok(pending);
      }

      const { rows } = await pool.query<{
        participant_id: string;
        status: string;
        topic_id: string | null;
        matched_rank: number | null;
        lottery_number: number;
        rounds: ResultFields["rounds"];
      }>(
        `SELECT participant_id, status, topic_id, matched_rank, lottery_number, rounds
         FROM allocation_result WHERE batch_id = $1`,
        [allocation.batchId],
      );

      const items: TeacherResultView[] = rows.map((r) => {
        const base = {
          participantId: r.participant_id,
          lotteryNumber: r.lottery_number,
          rounds: r.rounds ?? [],
        };
        if (r.status === "ASSIGNED" && r.topic_id && r.matched_rank) {
          return {
            ...base,
            status: "ASSIGNED",
            topicId: r.topic_id,
            matchedRank: r.matched_rank,
          };
        }
        return {
          ...base,
          status: r.status as "UNALLOCATED" | "NOT_SUBMITTED",
          topicId: null,
          matchedRank: null,
        };
      });

      const ready: TeacherResultsView = {
        preparation: "READY",
        items,
        ...allocation,
      };
      return ok(ready);
    },
  );

  app.get<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/evidence",
    async (req, reply) => {
      if (!req.actor || req.actor.role !== "TEACHER") {
        const { status, body } = fail("ROLE_FORBIDDEN", "当前角色无权执行此操作", 403);
        return reply.code(status).send(body);
      }
      const activity = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!activity) return;

      const { rows: snap } = await pool.query<{
        id: string;
        activity_id: string;
        frozen_at: Date;
        input: FrozenInput;
      }>(`SELECT id, activity_id, frozen_at, input FROM freeze_snapshot WHERE activity_id = $1`, [
        activity.id,
      ]);

      const { rows: batch } = await pool.query<{
        id: string;
        activity_id: string;
        snapshot_id: string;
        executed_at: Date;
      }>(`SELECT id, activity_id, snapshot_id, executed_at FROM allocation_batch WHERE activity_id = $1`, [
        activity.id,
      ]);

      const { rows: ops } = await pool.query<{
        id: string;
        activity_id: string;
        action: string;
        actor_kind: string;
        actor_account_id: string | null;
        outcome: string;
        occurred_at: Date;
        reason: string | null;
        snapshot_id: string | null;
        batch_id: string | null;
        safe_details: Record<string, unknown> | null;
      }>(
        `SELECT * FROM operation_log WHERE activity_id = $1 ORDER BY occurred_at ASC`,
        [activity.id],
      );

      const operations: OperationEvidence[] = ops.map((o) => {
        const base = {
          id: o.id,
          activityId: o.activity_id,
          action: o.action as OperationAction,
          occurredAt: o.occurred_at.toISOString(),
          outcome: o.outcome as "SUCCEEDED" | "FAILED",
          reason: o.reason ?? undefined,
          snapshotId: o.snapshot_id ?? undefined,
          batchId: o.batch_id ?? undefined,
          safeDetails: o.safe_details ?? undefined,
        };
        if (o.actor_kind === "SYSTEM") {
          return { ...base, actorKind: "SYSTEM" as const };
        }
        return {
          ...base,
          actorKind: o.actor_kind as "TEACHER" | "STUDENT",
          actorAccountId: o.actor_account_id!,
        };
      });

      const view: EvidenceView = {
        snapshot:
          snap.length > 0
            ? {
                id: snap[0].id,
                activityId: snap[0].activity_id,
                inputFormatVersion: 1,
                frozenAt: snap[0].frozen_at.toISOString(),
                input: snap[0].input,
              }
            : null,
        batch:
          batch.length > 0
            ? {
                id: batch[0].id,
                activityId: batch[0].activity_id,
                snapshotId: batch[0].snapshot_id,
                executedAt: batch[0].executed_at.toISOString(),
              }
            : null,
        operations,
      };
      return ok(view);
    },
  );

  app.post<{ Params: { activityId: string }; Body: ReasonInput }>(
    "/api/activities/:activityId/close",
    async (req, reply) => {
      if (!req.actor || req.actor.role !== "TEACHER") {
        const { status, body } = fail("ROLE_FORBIDDEN", "当前角色无权执行此操作", 403);
        return reply.code(status).send(body);
      }
      const activity = await loadOwnedActivity(req, reply, req.params.activityId);
      if (!activity) return;

      const reason = req.body?.reason?.trim() ?? "";
      if (!reason) {
        const { status, body } = fail("INVALID_INPUT", "请填写关闭原因", 400);
        return reply.code(status).send(body);
      }

      const allocation = await loadAllocationView(activity.id);
      if (!allocation) {
        const { status, body } = fail("FREEZE_REQUIRED", "尚未完成分配，不能关闭活动", 409);
        return reply.code(status).send(body);
      }

      const { rows } = await pool.query<{ closed_at: Date }>(
        `UPDATE activity
         SET lifecycle = 'CLOSED', closed_at = NOW(), closed_reason = $2
         WHERE id = $1 AND lifecycle IN ('PUBLISHED', 'ALLOCATED')
         RETURNING closed_at`,
        [activity.id, reason],
      );
      if (rows.length === 0) {
        const { status, body } = fail("VERSION_CONFLICT", "活动状态已变化，请刷新后重试", 409);
        return reply.code(status).send(body);
      }

      await insertOperationLog(pool, {
        activityId: activity.id,
        action: "CLOSE_ACTIVITY",
        actorKind: "TEACHER",
        actorAccountId: req.actor.accountId,
        outcome: "SUCCEEDED",
        batchId: allocation.batchId,
        reason,
      });

      const view: CloseView = {
        lifecycle: "CLOSED",
        closedAt: rows[0].closed_at.toISOString(),
        reason,
      };
      return ok(view);
    },
  );
};
