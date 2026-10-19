import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyPluginAsync } from "fastify";
import type { LoginInput } from "@coursematch/shared";
import { pool } from "../db/pool.js";
import { fail, ok } from "../lib/response.js";
import {
  digestToken,
  newSessionToken,
  sessionCookieName,
} from "../lib/session.js";

const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? "8");

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: LoginInput }>("/api/auth/login", async (req, reply) => {
    const { identifier, password } = req.body ?? {};
    if (!identifier || !password) {
      const { status, body } = fail("INVALID_INPUT", "请输入账号和密码", 400);
      return reply.code(status).send(body);
    }

    const { rows } = await pool.query(
      `SELECT a.id, a.password_hash, a.role, a.student_profile_id, sp.student_number, sp.name, a.identifier
       FROM account a
       LEFT JOIN student_profile sp ON sp.id = a.student_profile_id
       WHERE a.identifier = $1`,
      [identifier.trim()],
    );

    if (rows.length === 0) {
      await bcrypt.compare(password, "$2a$12$invalidhashinvalidhashinvalidha");
      const { status, body } = fail("INVALID_CREDENTIALS", "账号或密码错误", 401);
      return reply.code(status).send(body);
    }

    const row = rows[0];
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      const { status, body } = fail("INVALID_CREDENTIALS", "账号或密码错误", 401);
      return reply.code(status).send(body);
    }

    const token = newSessionToken();
    const sessionId = randomUUID();
    const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO session (id, account_id, credential_digest, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, row.id, digestToken(token), expires],
    );

    reply.setCookie(sessionCookieName(), token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    const actor =
      row.role === "TEACHER"
        ? {
            accountId: row.id,
            role: "TEACHER" as const,
            displayName: row.identifier,
          }
        : {
            accountId: row.id,
            role: "STUDENT" as const,
            displayName: row.name,
            studentProfileId: row.student_profile_id,
            studentNumber: row.student_number,
          };

    return ok(actor);
  });

  app.get("/api/auth/me", async (req, reply) => {
    if (!req.actor) {
      const { status, body } = fail("UNAUTHENTICATED", "请先登录", 401);
      return reply.code(status).send(body);
    }
    return ok(req.actor);
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies[sessionCookieName()];
    if (token) {
      await pool.query(
        `UPDATE session SET revoked_at = NOW()
         WHERE credential_digest = $1 AND revoked_at IS NULL`,
        [digestToken(token)],
      );
    }
    reply.clearCookie(sessionCookieName(), { path: "/" });
    return ok({ loggedOut: true as const });
  });

  app.put("/api/auth/password", async (req, reply) => {
    const { status, body } = fail(
      "INTERNAL_ERROR",
      "改密由共同底座后续补齐，当前请使用种子账号",
      501,
    );
    return reply.code(status).send(body);
  });
};
