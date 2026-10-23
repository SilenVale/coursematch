ALTER TABLE activity ADD COLUMN IF NOT EXISTS void_at TIMESTAMPTZ;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE TABLE IF NOT EXISTS topic (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  capacity INT NOT NULL CHECK (capacity > 0),
  eligibility_mode TEXT NOT NULL DEFAULT 'ALL'
    CHECK (eligibility_mode IN ('ALL', 'EXPLICIT')),
  eligibility_description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_eligible_participant (
  topic_id UUID NOT NULL REFERENCES topic (id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participant (id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_activity ON topic (activity_id);
CREATE INDEX IF NOT EXISTS idx_topic_eligible_topic ON topic_eligible_participant (topic_id);
