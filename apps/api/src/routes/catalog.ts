import type { FastifyPluginAsync } from "fastify";
import {
  listCatalogCourses,
  resolveOrCreateCatalogCourse,
} from "../catalog/catalog-db.js";
import { normalizeCatalogName } from "../catalog/normalize.js";
import { pool } from "../db/pool.js";
import { fail, ok } from "../lib/response.js";

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { q?: string } }>("/api/catalog/courses", async (req, reply) => {
    if (!req.actor) {
      const { status, body } = fail("UNAUTHENTICATED", "请先登录", 401);
      return reply.code(status).send(body);
    }
    if (req.actor.role !== "TEACHER") {
      const { status, body } = fail("ROLE_FORBIDDEN", "当前角色无权执行此操作", 403);
      return reply.code(status).send(body);
    }
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const rows = await listCatalogCourses(pool, q);
    return ok({
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  app.post<{ Body: { name?: string } }>("/api/catalog/courses", async (req, reply) => {
    if (!req.actor) {
      const { status, body } = fail("UNAUTHENTICATED", "请先登录", 401);
      return reply.code(status).send(body);
    }
    if (req.actor.role !== "TEACHER") {
      const { status, body } = fail("ROLE_FORBIDDEN", "当前角色无权执行此操作", 403);
      return reply.code(status).send(body);
    }
    const name = typeof req.body?.name === "string" ? req.body.name : "";
    if (!normalizeCatalogName(name)) {
      const { status, body } = fail("INVALID_INPUT", "请填写课程名称", 400);
      return reply.code(status).send(body);
    }
    try {
      const { row, created } = await resolveOrCreateCatalogCourse(
        pool,
        name,
        req.actor.accountId,
      );
      return ok({
        id: row.id,
        name: row.name,
        created,
      });
    } catch {
      const { status, body } = fail("INVALID_INPUT", "课程名称无效", 400);
      return reply.code(status).send(body);
    }
  });
};
