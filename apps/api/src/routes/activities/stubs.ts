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

const stubPaths = [
  "POST /api/activities",
  "PATCH /api/activities/:activityId",
  "GET /api/activities/:activityId/participants",
  "POST /api/activities/:activityId/participants/preview",
  "PUT /api/activities/:activityId/participants",
  "GET /api/activities/:activityId/topics",
  "POST /api/activities/:activityId/topics",
  "PATCH /api/activities/:activityId/topics/:topicId",
  "DELETE /api/activities/:activityId/topics/:topicId",
  "POST /api/activities/:activityId/publish",
  "GET /api/activities/:activityId/preferences/me",
  "PUT /api/activities/:activityId/preferences/me",
  "GET /api/activities/:activityId/preferences",
  "GET /api/activities/:activityId/freeze",
  "POST /api/activities/:activityId/freeze",
  "POST /api/activities/:activityId/allocation",
  "GET /api/activities/:activityId/results/me",
  "GET /api/activities/:activityId/results",
  "GET /api/activities/:activityId/evidence",
  "POST /api/activities/:activityId/void",
  "POST /api/activities/:activityId/close",
] as const;

export const activityStubRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/activities", async (_req, reply) => notImplemented(reply));
  app.patch("/api/activities/:activityId", async (_req, reply) => notImplemented(reply));
  app.get("/api/activities/:activityId/participants", async (_req, reply) =>
    notImplemented(reply),
  );
  app.post("/api/activities/:activityId/participants/preview", async (_req, reply) =>
    notImplemented(reply),
  );
  app.put("/api/activities/:activityId/participants", async (_req, reply) =>
    notImplemented(reply),
  );
  app.get("/api/activities/:activityId/topics", async (_req, reply) => notImplemented(reply));
  app.post("/api/activities/:activityId/topics", async (_req, reply) => notImplemented(reply));
  app.patch("/api/activities/:activityId/topics/:topicId", async (_req, reply) =>
    notImplemented(reply),
  );
  app.delete("/api/activities/:activityId/topics/:topicId", async (_req, reply) =>
    notImplemented(reply),
  );
  app.post("/api/activities/:activityId/publish", async (_req, reply) => notImplemented(reply));
  app.get("/api/activities/:activityId/preferences/me", async (_req, reply) =>
    notImplemented(reply),
  );
  app.put("/api/activities/:activityId/preferences/me", async (_req, reply) =>
    notImplemented(reply),
  );
  app.get("/api/activities/:activityId/preferences", async (_req, reply) =>
    notImplemented(reply),
  );
  app.get("/api/activities/:activityId/freeze", async (_req, reply) => notImplemented(reply));
  app.post("/api/activities/:activityId/freeze", async (_req, reply) => notImplemented(reply));
  app.post("/api/activities/:activityId/allocation", async (_req, reply) =>
    notImplemented(reply),
  );
  app.get("/api/activities/:activityId/results/me", async (_req, reply) =>
    notImplemented(reply),
  );
  app.get("/api/activities/:activityId/results", async (_req, reply) => notImplemented(reply));
  app.get("/api/activities/:activityId/evidence", async (_req, reply) => notImplemented(reply));
  app.post("/api/activities/:activityId/void", async (_req, reply) => notImplemented(reply));
  app.post("/api/activities/:activityId/close", async (_req, reply) => notImplemented(reply));

  void stubPaths;
};
