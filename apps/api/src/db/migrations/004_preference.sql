-- M3 志愿：一名学生在一个活动里最多保存 3 条有序志愿（整单提交，不占名额）。
--
-- 存成「每志愿一行」而不是「一行存数组」，是为了对齐 M2 已经写好的热度查询：
--   SELECT COUNT(*) FROM preference pref WHERE pref.topic_id = t.id
-- 如果改成数组列，那条查询会直接失效，热度恒为 0 且被 42P01 兜底掩盖。

CREATE TABLE IF NOT EXISTS preference (
  activity_id UUID NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participant (id) ON DELETE CASCADE,
  rank INT NOT NULL CHECK (rank BETWEEN 1 AND 3),
  topic_id UUID NOT NULL REFERENCES topic (id) ON DELETE CASCADE,
  version INT NOT NULL CHECK (version > 0),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (participant_id, rank),
  UNIQUE (participant_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_preference_topic ON preference (topic_id);
CREATE INDEX IF NOT EXISTS idx_preference_activity ON preference (activity_id);
