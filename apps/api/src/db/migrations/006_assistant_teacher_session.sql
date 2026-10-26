-- 每位教师的选课助理：对话与草稿（按账号长期保存，退出登录后仍可恢复）
CREATE TABLE IF NOT EXISTS assistant_teacher_session (
  account_id UUID PRIMARY KEY REFERENCES account (id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
