import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { normalizeCatalogName } from "./normalize.js";

export interface CatalogCourseRow {
  id: string;
  name: string;
  normalizedName: string;
  createdByAccountId: string | null;
  createdAt: Date;
}

type Db = Pool | PoolClient;

function mapRow(row: {
  id: string;
  name: string;
  normalized_name: string;
  created_by_account_id: string | null;
  created_at: Date;
}): CatalogCourseRow {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    createdByAccountId: row.created_by_account_id,
    createdAt: row.created_at,
  };
}

export async function findCatalogByNormalizedName(
  db: Db,
  name: string,
): Promise<CatalogCourseRow | null> {
  const normalized = normalizeCatalogName(name);
  if (!normalized) return null;
  const { rows } = await db.query<{
    id: string;
    name: string;
    normalized_name: string;
    created_by_account_id: string | null;
    created_at: Date;
  }>(
    `SELECT id, name, normalized_name, created_by_account_id, created_at
     FROM course_catalog WHERE normalized_name = $1`,
    [normalized],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listCatalogCourses(
  db: Db,
  query: string | undefined,
  limit = 50,
): Promise<CatalogCourseRow[]> {
  const q = query?.trim();
  const { rows } = q
    ? await db.query(
        `SELECT id, name, normalized_name, created_by_account_id, created_at
         FROM course_catalog
         WHERE name ILIKE $1
         ORDER BY name ASC
         LIMIT $2`,
        [`%${q}%`, limit],
      )
    : await db.query(
        `SELECT id, name, normalized_name, created_by_account_id, created_at
         FROM course_catalog
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      );
  return rows.map(mapRow);
}

/** 已有则返回已有；否则插入新课种。 */
export async function resolveOrCreateCatalogCourse(
  db: Db,
  name: string,
  createdByAccountId: string | null,
): Promise<{ row: CatalogCourseRow; created: boolean }> {
  const trimmed = normalizeCatalogName(name);
  if (!trimmed) {
    throw new Error("EMPTY_CATALOG_NAME");
  }
  const existing = await findCatalogByNormalizedName(db, trimmed);
  if (existing) return { row: existing, created: false };

  const { rows } = await db.query<{
    id: string;
    name: string;
    normalized_name: string;
    created_by_account_id: string | null;
    created_at: Date;
  }>(
    `INSERT INTO course_catalog (id, name, normalized_name, created_by_account_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, normalized_name, created_by_account_id, created_at`,
    [randomUUID(), trimmed, normalizeCatalogName(trimmed), createdByAccountId],
  );
  return { row: mapRow(rows[0]), created: true };
}
