CREATE TABLE IF NOT EXISTS appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  opportunity_id  UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'America/Caracas',
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  location        TEXT,
  meeting_url     TEXT,
  provider        TEXT NOT NULL DEFAULT 'manual'
                  CHECK (provider IN ('manual','google','zoom')),
  provider_event_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_org     ON appointments(organization_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_user    ON appointments(user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_contact ON appointments(contact_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_opp     ON appointments(opportunity_id, start_at);

CREATE TABLE IF NOT EXISTS calendar_settings (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone              TEXT NOT NULL DEFAULT 'America/Caracas',
  working_hours         JSONB NOT NULL DEFAULT '{"start":"09:00","end":"18:00","days":[1,2,3,4,5]}',
  google_refresh_token  TEXT,
  google_calendar_id    TEXT,
  zoom_refresh_token    TEXT,
  zoom_user_id          TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
