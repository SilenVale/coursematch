import type pg from "pg";

export interface TeacherSessionPayload {
  v: 1;
  draft: unknown;
  lines: { role: "teacher" | "assistant"; text: string }[];
  confirm: { action: string; summary: string[] } | null;
}

const MAX_LINES = 120;

export function trimSessionPayload(payload: TeacherSessionPayload): TeacherSessionPayload {
  return {
    ...payload,
    v: 1,
    lines: Array.isArray(payload.lines) ? payload.lines.slice(-MAX_LINES) : [],
  };
}

export async function loadTeacherSession(
  pool: pg.Pool,
  accountId: string,
): Promise<TeacherSessionPayload | null> {
  const result = await pool.query<{ payload: TeacherSessionPayload }>(
    "SELECT payload FROM assistant_teacher_session WHERE account_id = $1",
    [accountId],
  );
  const row = result.rows[0];
  if (!row?.payload || row.payload.v !== 1) return null;
  return trimSessionPayload(row.payload);
}

export async function saveTeacherSession(
  pool: pg.Pool,
  accountId: string,
  payload: TeacherSessionPayload,
): Promise<void> {
  const trimmed = trimSessionPayload(payload);
  await pool.query(
    `INSERT INTO assistant_teacher_session (account_id, payload, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (account_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
    [accountId, JSON.stringify(trimmed)],
  );
}

export async function clearTeacherSession(pool: pg.Pool, accountId: string): Promise<void> {
  await pool.query("DELETE FROM assistant_teacher_session WHERE account_id = $1", [accountId]);
}
