CREATE TABLE IF NOT EXISTS course_catalog (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_by_account_id UUID REFERENCES account (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT course_catalog_normalized_name_unique UNIQUE (normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_course_catalog_name ON course_catalog (name);

ALTER TABLE topic
  ADD COLUMN IF NOT EXISTS catalog_course_id UUID REFERENCES course_catalog (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_topic_catalog_course ON topic (catalog_course_id);
