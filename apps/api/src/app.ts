import type { ActorView } from "@coursematch/shared";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
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
import { activityReadRoutes } from "./routes/activities/read.js";
import { activityResultsRoutes } from "./routes/activities/results.js";
import { activityStubRoutes } from "./routes/activities/stubs.js";
import { demoRoleCheck } from "./routes/role-guard.js";

export async function buildApp() {
  const app = Fastify({ logger: true });
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

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
  await app.register(activityStubRoutes);

  app.get("/api/health", async () => ({ ok: true }));

  return app;
}
