ALTER TABLE activity ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS closed_reason TEXT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS freeze_last_failure JSONB;

CREATE TABLE IF NOT EXISTS preference_submission (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participant (id) ON DELETE CASCADE,
  topic_ids UUID[] NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_pref_activity ON preference_submission (activity_id);

CREATE TABLE IF NOT EXISTS freeze_snapshot (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL UNIQUE REFERENCES activity (id) ON DELETE CASCADE,
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS allocation_batch (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL UNIQUE REFERENCES activity (id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES freeze_snapshot (id),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  counts JSONB NOT NULL,
  topic_stats JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS allocation_result (
  batch_id UUID NOT NULL REFERENCES allocation_batch (id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participant (id),
  status TEXT NOT NULL CHECK (status IN ('ASSIGNED', 'UNALLOCATED', 'NOT_SUBMITTED')),
  topic_id UUID REFERENCES topic (id),
  matched_rank INT,
  lottery_number INT NOT NULL,
  rounds JSONB NOT NULL DEFAULT '[]',
  PRIMARY KEY (batch_id, participant_id)
);

CREATE TABLE IF NOT EXISTS operation_log (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('TEACHER', 'STUDENT', 'SYSTEM')),
  actor_account_id UUID REFERENCES account (id),
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCEEDED', 'FAILED')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  snapshot_id UUID REFERENCES freeze_snapshot (id),
  batch_id UUID REFERENCES allocation_batch (id),
  safe_details JSONB
);

CREATE INDEX IF NOT EXISTS idx_operation_activity ON operation_log (activity_id, occurred_at DESC);
