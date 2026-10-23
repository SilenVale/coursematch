/**
 * 刘家铭 · M3 志愿（本人志愿读写）。
 *
 *   GET /api/activities/:activityId/preferences/me
 *   PUT /api/activities/:activityId/preferences/me
 *
 * 题目浏览（含学生视图 canChoose 与热度）由 M2 的 config.ts 实现，本文件不重复实现，
 * 也不改它。结果只来自服务端：本文件不计算任何分配结果。
 *
 * 规则要点：
 * - 整单提交，1～maxPreferences 个有序且不重复的题目；不占名额、不预分配。
 * - 截止判定用数据库时钟，且先对活动行加锁再读时间。
 * - expectedVersion 乐观锁：不一致返回 VERSION_CONFLICT，失败不覆盖上一次有效提交。
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ErrorCode, Lifecycle, PreferenceView } from "@coursematch/shared";
import { pool } from "../../db/pool.js";
import { fail, ok } from "../../lib/response.js";
import {
  derivePhase,
  validateExpectedVersion,
  validatePreferenceWrite,
  writeBlockedByPhase,
} from "./preferences-rules.js";

interface ActivityRow {
  id: string;
  lifecycle: Lifecycle;
  start_at: Date;
  deadline_at: Date;
  max_preferences: number;
  config_version: number;
  db_now: Date;
}

interface TopicCheckRow {
  id: string;
  title: string;
  eligibility_mode: "ALL" | "EXPLICIT";
  eligible: boolean;
}

export interface PreferenceBody {
  topicIds?: unknown;
  expectedVersion?: unknown;
}

function send(
  reply: FastifyReply,
  code: ErrorCode,
  message: string,
  status: number,
  extra?: { fieldErrors?: unknown[] },
) {
  const { status: httpStatus, body } = fail(code, message, status, extra);
  return reply.code(httpStatus).send(body);
}

function studentProfileId(req: FastifyRequest): string | null {
  return req.actor?.role === "STUDENT" ? req.actor.studentProfileId : null;
}

/** 学生必须在本活动名单内；不在名单按「找不到」处理，不透露活动是否存在。 */
const PARTICIPANT_SQL = `SELECT id FROM participant
                         WHERE activity_id = $1 AND student_profile_id = $2`;

async function findParticipantId(
  activityId: string,
  profileId: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(PARTICIPANT_SQL, [
    activityId,
    profileId,
  ]);
  return rows[0]?.id ?? null;
}

export const activityPreferenceRoutes: FastifyPluginAsync = async (app) => {
  // ------------------------------------------------------------ 读取本人志愿
  app.get<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/preferences/me",
    async (req, reply) => {
      if (!req.actor) return send(reply, "UNAUTHENTICATED", "请先登录", 401);
      if (req.actor.role !== "STUDENT") {
        return send(reply, "ROLE_FORBIDDEN", "当前角色无权查看学生志愿", 403);
      }

      const profileId = studentProfileId(req);
      if (!profileId) return send(reply, "UNAUTHENTICATED", "会话学生信息缺失", 401);

      const { rows: activityRows } = await pool.query<{ lifecycle: Lifecycle }>(
        `SELECT lifecycle FROM activity WHERE id = $1`,
        [req.params.activityId],
      );
      const activity = activityRows[0];
      if (!activity || activity.lifecycle === "DRAFT") {
        return send(reply, "RESOURCE_NOT_FOUND", "活动不存在", 404);
      }

      const participantId = await findParticipantId(req.params.activityId, profileId);
      if (!participantId) return send(reply, "RESOURCE_NOT_FOUND", "活动不存在", 404);

      const { rows } = await pool.query<{
        topic_id: string;
        version: number;
        submitted_at: Date;
      }>(
        `SELECT topic_id, version, submitted_at
         FROM preference
         WHERE participant_id = $1
         ORDER BY rank`,
        [participantId],
      );

      const view: PreferenceView = {
        topicIds: rows.map((r) => r.topic_id),
        version: rows[0]?.version ?? 0,
        submittedAt: rows[0] ? rows[0].submitted_at.toISOString() : null,
      };
      return ok(view);
    },
  );

  // ------------------------------------------------------------ 整单保存志愿
  app.put<{ Params: { activityId: string }; Body: PreferenceBody }>(
    "/api/activities/:activityId/preferences/me",
    async (req, reply) => {
      if (!req.actor) return send(reply, "UNAUTHENTICATED", "请先登录", 401);
      if (req.actor.role !== "STUDENT") {
        return send(reply, "ROLE_FORBIDDEN", "当前角色无权提交学生志愿", 403);
      }

      const profileId = studentProfileId(req);
      if (!profileId) return send(reply, "UNAUTHENTICATED", "会话学生信息缺失", 401);

      const versionErrors = validateExpectedVersion(req.body?.expectedVersion);
      if (versionErrors.length > 0) {
        return send(reply, "INVALID_INPUT", "请求缺少版本号", 400, {
          fieldErrors: versionErrors,
        });
      }
      const expectedVersion = req.body!.expectedVersion as number;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 先锁活动行，再读数据库时钟——截止判定不能依赖浏览器时间。
        const { rows: activityRows } = await client.query<ActivityRow>(
          `SELECT *, now() AS db_now FROM activity WHERE id = $1 FOR UPDATE`,
          [req.params.activityId],
        );
        const activity = activityRows[0];
        if (!activity || activity.lifecycle === "DRAFT") {
          await client.query("ROLLBACK");
          return send(reply, "RESOURCE_NOT_FOUND", "活动不存在", 404);
        }

        const { rows: participantRows } = await client.query<{ id: string }>(
          PARTICIPANT_SQL,
          [req.params.activityId, profileId],
        );
        const participantId = participantRows[0]?.id ?? null;
        if (!participantId) {
          await client.query("ROLLBACK");
          return send(reply, "RESOURCE_NOT_FOUND", "活动不存在", 404);
        }

        // 纯校验放在锁内、截止判定之后：先回答「能不能写」，再回答「内容对不对」。
        const phase = derivePhase(
          activity.lifecycle,
          activity.start_at,
          activity.deadline_at,
          activity.db_now,
        );
        const blocked = writeBlockedByPhase(phase);
        if (blocked) {
          await client.query("ROLLBACK");
          return send(reply, blocked.code, blocked.message, blocked.status);
        }

        const parsed = validatePreferenceWrite(req.body, activity.max_preferences);
        if (!parsed.ok) {
          await client.query("ROLLBACK");
          return send(reply, "INVALID_INPUT", "志愿内容不合法", 400, {
            fieldErrors: parsed.fieldErrors,
          });
        }

        const { rows: currentRows } = await client.query<{ version: number }>(
          `SELECT COALESCE(MAX(version), 0)::int AS version
           FROM preference WHERE participant_id = $1`,
          [participantId],
        );
        const currentVersion = currentRows[0]?.version ?? 0;
        if (currentVersion !== expectedVersion) {
          await client.query("ROLLBACK");
          return send(
            reply,
            "VERSION_CONFLICT",
            `志愿已在别处更新（当前版本 ${currentVersion}，你提交的是 ${expectedVersion}），请刷新后重试`,
            409,
          );
        }

        // 题目必须属于本活动；限定名单的题目还要判本人是否满足。
        const { rows: topicRows } = await client.query<TopicCheckRow>(
          `SELECT t.id,
                  t.title,
                  t.eligibility_mode,
                  EXISTS (
                    SELECT 1 FROM topic_eligible_participant e
                    WHERE e.topic_id = t.id AND e.participant_id = $2
                  ) AS eligible
           FROM topic t
           WHERE t.activity_id = $1 AND t.id = ANY($3::uuid[])`,
          [req.params.activityId, participantId, parsed.topicIds],
        );

        if (topicRows.length !== parsed.topicIds.length) {
          await client.query("ROLLBACK");
          return send(reply, "INVALID_INPUT", "志愿中有题目不存在或不属于本活动", 400, {
            fieldErrors: [
              {
                field: "topicIds",
                code: "INVALID_REFERENCE",
                message: "请刷新题目列表后重新选择",
              },
            ],
          });
        }

        const byId = new Map(topicRows.map((t) => [t.id, t]));
        for (const topicId of parsed.topicIds) {
          const topic = byId.get(topicId);
          if (topic && topic.eligibility_mode === "EXPLICIT" && !topic.eligible) {
            await client.query("ROLLBACK");
            return send(reply, "NOT_ELIGIBLE", `你不满足《${topic.title}》的选题要求`, 403, {
              fieldErrors: [
                {
                  field: "topicIds",
                  code: "NOT_ELIGIBLE",
                  message: `《${topic.title}》仅对指定学生开放`,
                },
              ],
            });
          }
        }

        const nextVersion = currentVersion + 1;

        // 整单替换：先删后插，同一事务内完成，失败不会留下半份志愿。
        await client.query(`DELETE FROM preference WHERE participant_id = $1`, [
          participantId,
        ]);
        await client.query(
          `INSERT INTO preference
             (activity_id, participant_id, rank, topic_id, version, submitted_at)
           SELECT $1, $2, item.ord::int, item.topic_id, $3, $4::timestamptz
           FROM unnest($5::uuid[]) WITH ORDINALITY AS item(topic_id, ord)`,
          [
            req.params.activityId,
            participantId,
            nextVersion,
            activity.db_now,
            parsed.topicIds,
          ],
        );

        await client.query("COMMIT");

        const view: PreferenceView = {
          topicIds: parsed.topicIds,
          version: nextVersion,
          submittedAt: activity.db_now.toISOString(),
        };
        return ok(view);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        req.log.error({ err: error }, "保存志愿失败");
        return send(reply, "INTERNAL_ERROR", "保存志愿失败，请稍后重试", 500);
      } finally {
        client.release();
      }
    },
  );
};
