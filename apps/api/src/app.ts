import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ActorView } from "@coursematch/shared";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import "dotenv/config";

declare module "fastify" {
  interface FastifyRequest {
    actor: ActorView | null;
  }
}
import { pool } from "./db/pool.js";
import { loadActorBySession, sessionCookieName } from "./lib/session.js";
import { registerCsrfProtection } from "./plugins/csrf.js";
import { authRoutes } from "./routes/auth.js";
import { activityConfigRoutes } from "./routes/activities/config.js";
import { freezeAllocationRoutes } from "./routes/activities/freeze-allocation.js";
import { activityPreferenceRoutes } from "./routes/activities/preferences.js";
import { activityReadRoutes } from "./routes/activities/read.js";
import { activityResultsRoutes } from "./routes/activities/results.js";
import { activityStubRoutes } from "./routes/activities/stubs.js";
import { demoRoleCheck } from "./routes/role-guard.js";

export async function buildApp() {
  const app = Fastify({ logger: true });
  const webOrigin =
    process.env.WEB_ORIGIN ??
    process.env.RENDER_EXTERNAL_URL ??
    "http://localhost:5173";

  await app.register(cors, {
    origin: webOrigin,
    credentials: true,
  });
  await app.register(cookie);
  registerCsrfProtection(app);

  app.decorateRequest("actor", null);
  app.addHook("preHandler", async (req) => {
    const token = req.cookies[sessionCookieName()];
    req.actor = await loadActorBySession(pool, token);
  });

  app.addHook("preHandler", demoRoleCheck);

  await app.register(authRoutes);
  await app.register(activityReadRoutes);
  await app.register(activityConfigRoutes);
  await app.register(freezeAllocationRoutes);
  await app.register(activityResultsRoutes);
  // M3 必须在 stubs 之前注册：stub 里同名路由会让 Fastify 抛重复路由。
  await app.register(activityPreferenceRoutes);
  await app.register(activityStubRoutes);

  app.get("/api/health", async () => ({ ok: true }));

  const serveWeb =
    process.env.SERVE_WEB === "1" ||
    (process.env.NODE_ENV === "production" && process.env.SERVE_WEB !== "0");
  if (serveWeb) {
    const apiDir = dirname(fileURLToPath(import.meta.url));
    const webRoot = join(apiDir, "../../web/dist");
    await app.register(fastifyStatic, {
      root: webRoot,
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({
        error: { code: "RESOURCE_NOT_FOUND", message: "Not Found" },
      });
    });
  }

  return app;
}
