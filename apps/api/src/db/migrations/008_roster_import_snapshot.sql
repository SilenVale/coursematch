-- 记录最近一次整份替换的 CSV 原文与来源，供教师核对「当前名单对应哪份文件」。
ALTER TABLE activity ADD COLUMN IF NOT EXISTS roster_source_label TEXT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS roster_imported_at TIMESTAMPTZ;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS roster_csv_snapshot TEXT;
