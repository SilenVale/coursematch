import type { FastifyReply, FastifyRequest } from "fastify";
import type { ActorView } from "@coursematch/shared";
import { fail } from "../lib/response.js";

export function requireRole(
  actor: ActorView | null,
  role: "TEACHER" | "STUDENT",
  reply: FastifyReply,
): boolean {
  if (!actor) {
    const { status, body } = fail("UNAUTHENTICATED", "请先登录", 401);
    reply.code(status).send(body);
    return false;
  }
  if (actor.role !== role) {
    const { status, body } = fail("ROLE_FORBIDDEN", "当前角色无权执行此操作", 403);
    reply.code(status).send(body);
    return false;
  }
  return true;
}

export async function demoRoleCheck(req: FastifyRequest, reply: FastifyReply) {
  if (req.url === "/api/activities" && req.method === "GET") return;
  if (req.url.match(/^\/api\/activities\/[^/]+$/) && req.method === "GET") return;
  if (!req.url.startsWith("/api/activities")) return;
  if (req.method === "GET") return;

  const teacherOnly =
    req.url.includes("/participants") ||
    req.url.includes("/publish") ||
    req.url.includes("/freeze") ||
    req.url.includes("/allocation") ||
    req.url.includes("/results") ||
    req.url.includes("/evidence") ||
    req.url.includes("/void") ||
    req.url.includes("/close") ||
    (req.url.includes("/topics") && req.method !== "GET") ||
    req.method === "POST" && req.url === "/api/activities" ||
    req.method === "PATCH";

  const studentOnly = req.url.includes("/preferences/me");

  if (teacherOnly && !requireRole(req.actor, "TEACHER", reply)) return reply;
  if (studentOnly && !requireRole(req.actor, "STUDENT", reply)) return reply;
}
