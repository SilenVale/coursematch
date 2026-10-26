import type pg from "pg";
import { readServerKeyFile, readServerLlmOptionsFile } from "./llm-secret-file.js";
import { setSiteLlmCache, type SiteLlmRecord } from "./llm-site-cache.js";

export async function loadSiteLlmFromDb(pool: pg.Pool): Promise<SiteLlmRecord | null> {
  const result = await pool.query<{ api_key: string; api_url: string | null; model: string | null }>(
    "SELECT api_key, api_url, model FROM assistant_site_llm WHERE id = 1",
  );
  const row = result.rows[0];
  if (!row?.api_key?.trim()) return null;
  return {
    apiKey: row.api_key.trim(),
    apiUrl: row.api_url?.trim() || null,
    model: row.model?.trim() || null,
  };
}

export async function upsertSiteLlmInDb(
  pool: pg.Pool,
  input: { apiKey: string; apiUrl: string; model: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO assistant_site_llm (id, api_key, api_url, model, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET
       api_key = EXCLUDED.api_key,
       api_url = EXCLUDED.api_url,
       model = EXCLUDED.model,
       updated_at = now()`,
    [input.apiKey.trim(), input.apiUrl.trim() || null, input.model.trim() || null],
  );
  setSiteLlmCache({
    apiKey: input.apiKey.trim(),
    apiUrl: input.apiUrl.trim() || null,
    model: input.model.trim() || null,
  });
}

/** 启动时从 Postgres 加载；若库为空则尝试从本地密钥文件迁入（便于 Dev 升级）。 */
export async function hydrateSiteLlmFromDatabase(pool: pg.Pool): Promise<void> {
  try {
    let record = await loadSiteLlmFromDb(pool);
    if (!record) {
      const fromFile = readServerKeyFile();
      if (fromFile) {
        const opts = readServerLlmOptionsFile();
        const apiUrl = opts.apiUrl?.trim() || process.env.DEEPSEEK_API_URL?.trim() || "";
        const model = opts.model?.trim() || process.env.DEEPSEEK_MODEL?.trim() || "";
        await upsertSiteLlmInDb(pool, {
          apiKey: fromFile,
          apiUrl,
          model,
        });
      }
    } else {
      setSiteLlmCache(record);
    }
  } catch {
    setSiteLlmCache(null);
  }
}
