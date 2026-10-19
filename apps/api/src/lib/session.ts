import { createHash, randomBytes } from "node:crypto";
import type { ActorView } from "@coursematch/shared";
import type { Pool } from "pg";

const COOKIE_NAME = "cm-session";

export function sessionCookieName(): string {
  return COOKIE_NAME;
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function loadActorBySession(
  pool: Pool,
  token: string | undefined,
): Promise<ActorView | null> {
  if (!token) return null;
  const digest = digestToken(token);
  const { rows } = await pool.query(
    `SELECT a.id, a.role, a.identifier, a.student_profile_id, sp.student_number, sp.name
     FROM session s
     JOIN account a ON a.id = s.account_id
     LEFT JOIN student_profile sp ON sp.id = a.student_profile_id
     WHERE s.credential_digest = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()`,
    [digest],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.role === "TEACHER") {
    return {
      accountId: row.id,
      role: "TEACHER",
      displayName: row.identifier,
    };
  }
  return {
    accountId: row.id,
    role: "STUDENT",
    displayName: row.name,
    studentProfileId: row.student_profile_id,
    studentNumber: row.student_number,
  };
}
