import type { FastifyPluginAsync } from "fastify";
import type { ActivityPhase, ActivitySummary, ActivityView, Lifecycle } from "@coursematch/shared";
import { pool } from "../../db/pool.js";
import { fail, ok } from "../../lib/response.js";

function derivePhase(
  lifecycle: Lifecycle,
  startAt: Date,
  deadlineAt: Date,
  now: Date,
): ActivityPhase {
  if (lifecycle === "VOID") return "VOID";
  if (lifecycle === "CLOSED") return "CLOSED";
  if (lifecycle === "DRAFT") return "DRAFT";
  if (now < startAt) return "NOT_STARTED";
  if (now < deadlineAt) return "FILLING";
  if (lifecycle === "PUBLISHED") return "DEADLINE_REACHED";
  if (lifecycle === "ALLOCATED") return "ALLOCATED";
  return "DRAFT";
}

function mapSummary(row: Record<string, unknown>): ActivitySummary {
  const startAt = row.start_at as Date;
  const deadlineAt = row.deadline_at as Date;
  const lifecycle = row.lifecycle as Lifecycle;
  return {
    activityId: row.id as string,
    title: row.title as string,
    lifecycle,
    phase: derivePhase(lifecycle, startAt, deadlineAt, new Date()),
    startAt: startAt.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
  };
}

function mapView(row: Record<string, unknown>): ActivityView {
  const summary = mapSummary(row);
  return {
    ...summary,
    description: row.description as string,
    maxPreferences: row.max_preferences as number,
    ruleVersion: row.rule_version as string,
    configVersion: row.config_version as number,
    freezePreparation: "PENDING",
    resultPreparation: "PENDING",
    allowedActions: [],
  };
}

export const activityReadRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/activities", async (req, reply) => {
    if (!req.actor) {
      const { status, body } = fail("UNAUTHENTICATED", "请先登录", 401);
      return reply.code(status).send(body);
    }

    if (req.actor.role === "TEACHER") {
      const { rows } = await pool.query(
        `SELECT * FROM activity WHERE owner_account_id = $1 ORDER BY created_at DESC`,
        [req.actor.accountId],
      );
      return ok({ items: rows.map(mapSummary) });
    }

    const { rows } = await pool.query(
      `SELECT a.*
       FROM activity a
       JOIN participant p ON p.activity_id = a.id
       JOIN account acc ON acc.student_profile_id = p.student_profile_id
       WHERE acc.id = $1 AND a.lifecycle <> 'DRAFT'
       ORDER BY a.created_at DESC`,
      [req.actor.accountId],
    );
    return ok({ items: rows.map(mapSummary) });
  });

  app.get<{ Params: { activityId: string } }>(
    "/api/activities/:activityId",
    async (req, reply) => {
      if (!req.actor) {
        const { status, body } = fail("UNAUTHENTICATED", "请先登录", 401);
        return reply.code(status).send(body);
      }

      const { activityId } = req.params;
      const { rows } = await pool.query(`SELECT * FROM activity WHERE id = $1`, [
        activityId,
      ]);
      if (rows.length === 0) {
        const { status, body } = fail("RESOURCE_NOT_FOUND", "活动不存在", 404);
        return reply.code(status).send(body);
      }
      const row = rows[0];

      if (req.actor.role === "TEACHER") {
        if (row.owner_account_id !== req.actor.accountId) {
          const { status, body } = fail("RESOURCE_NOT_FOUND", "活动不存在", 404);
          return reply.code(status).send(body);
        }
        return ok(mapView(row));
      }

      const { rows: part } = await pool.query(
        `SELECT 1 FROM participant p
         JOIN account a ON a.student_profile_id = p.student_profile_id
         WHERE p.activity_id = $1 AND a.id = $2 AND $3 <> 'DRAFT'`,
        [activityId, req.actor.accountId, row.lifecycle],
      );
      if (part.length === 0) {
        const { status, body } = fail("RESOURCE_NOT_FOUND", "活动不存在", 404);
        return reply.code(status).send(body);
      }
      return ok(mapView(row));
    },
  );
};
