CREATE TABLE IF NOT EXISTS student_profile (
  id UUID PRIMARY KEY,
  student_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enrollment_year TEXT NOT NULL,
  major TEXT NOT NULL,
  class_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account (
  id UUID PRIMARY KEY,
  identifier TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('TEACHER', 'STUDENT')),
  password_hash TEXT NOT NULL,
  student_profile_id UUID REFERENCES student_profile (id),
  CHECK (
    (role = 'STUDENT' AND student_profile_id IS NOT NULL)
    OR (role = 'TEACHER' AND student_profile_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS session (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  credential_digest TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS activity (
  id UUID PRIMARY KEY,
  owner_account_id UUID NOT NULL REFERENCES account (id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_at TIMESTAMPTZ NOT NULL,
  deadline_at TIMESTAMPTZ NOT NULL,
  max_preferences INT NOT NULL CHECK (max_preferences BETWEEN 1 AND 3),
  rule_version TEXT NOT NULL DEFAULT 'cm-rule-v1',
  lifecycle TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle IN ('DRAFT', 'PUBLISHED', 'ALLOCATED', 'CLOSED', 'VOID')),
  config_version INT NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS participant (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES student_profile (id),
  eligible BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (activity_id, student_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_session_account ON session (account_id);
CREATE INDEX IF NOT EXISTS idx_activity_owner ON activity (owner_account_id);
CREATE INDEX IF NOT EXISTS idx_participant_activity ON participant (activity_id);
