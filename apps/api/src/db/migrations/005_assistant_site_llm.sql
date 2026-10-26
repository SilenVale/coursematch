-- 全站 DeepSeek 配置（教师在站点保存一次，Render 重启后仍从 Postgres 读取）
CREATE TABLE IF NOT EXISTS assistant_site_llm (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_key TEXT NOT NULL,
  api_url TEXT,
  model TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
