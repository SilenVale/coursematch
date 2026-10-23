import type { FastifyPluginAsync } from "fastify";
import { fail } from "../../lib/response.js";

function notImplemented(reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const { status, body } = fail(
    "INTERNAL_ERROR",
    "本接口待模块负责人实现，见 docs/INTERNAL_MODULES.md",
    501,
  );
  return reply.code(status).send(body);
}

/** M2/M4/M5 已实现的路由见对应模块；此处仅保留未落地接口。 */
const stubPaths = [
  "GET /api/activities/:activityId/preferences/me",
  "PUT /api/activities/:activityId/preferences/me",
  "GET /api/activities/:activityId/preferences",
] as const;

export const activityStubRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/activities/:activityId/preferences/me", async (_req, reply) =>
    notImplemented(reply),
  );
  app.put("/api/activities/:activityId/preferences/me", async (_req, reply) =>
    notImplemented(reply),
  );
  app.get("/api/activities/:activityId/preferences", async (_req, reply) =>
    notImplemented(reply),
  );

  void stubPaths;
};
