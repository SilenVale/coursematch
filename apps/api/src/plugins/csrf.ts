import type { FastifyInstance } from "fastify";
import { fail } from "../lib/response.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** 在根 Fastify 实例上注册，使所有路由受 CSRF 规则约束。 */
export function registerCsrfProtection(app: FastifyInstance) {
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

  app.addHook("preHandler", async (req, reply) => {
    if (!MUTATING.has(req.method)) return;
    if (req.url.startsWith("/api/auth/login")) return;

    const origin = req.headers.origin;
    const header = req.headers["x-coursematch-request"];
    if (origin !== webOrigin || header !== "1") {
      const { status, body } = fail(
        "REQUEST_ORIGIN_FORBIDDEN",
        "请求来源或安全头无效",
        403,
      );
      return reply.code(status).send(body);
    }
  });
}
