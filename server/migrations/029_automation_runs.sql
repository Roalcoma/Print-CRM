CREATE TABLE IF NOT EXISTS automation_runs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id    UUID        NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  contact_id       UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  contact_phone    TEXT,
  status           TEXT        NOT NULL DEFAULT 'running',
  current_step     INTEGER     NOT NULL DEFAULT 0,
  step_data        JSONB       NOT NULL DEFAULT '{}',
  waiting_since    TIMESTAMPTZ,
  resume_at        TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_runs_resume
  ON automation_runs(resume_at)
  WHERE status = 'waiting_timed';

CREATE INDEX IF NOT EXISTS idx_auto_runs_org_status
  ON automation_runs(organization_id, status);
