-- Sincronización producción: columnas y tablas añadidas manualmente en dev.

-- appointments: token de cancelación/reagendado
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_token UUID DEFAULT gen_random_uuid();

-- calendars: tipo y detalle de ubicación (Google Meet, Zoom, custom)
ALTER TABLE calendars ADD COLUMN IF NOT EXISTS location      TEXT;
ALTER TABLE calendars ADD COLUMN IF NOT EXISTS location_type TEXT NOT NULL DEFAULT 'custom';

-- calendar_settings: FK a organización
ALTER TABLE calendar_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- calendar_members: miembros de un calendario (para Google Meet multi-usuario)
CREATE TABLE IF NOT EXISTS calendar_members (
  calendar_id UUID      NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  user_id     UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary  BOOLEAN   NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (calendar_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_members_cal  ON calendar_members(calendar_id);
CREATE INDEX IF NOT EXISTS idx_calendar_members_user ON calendar_members(user_id);

-- calendar_availability_overrides: excepciones de disponibilidad por fecha
CREATE TABLE IF NOT EXISTS calendar_availability_overrides (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  override_date   DATE        NOT NULL,
  is_available    BOOLEAN     NOT NULL DEFAULT false,
  start_time      TIME,
  end_time        TIME,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id, override_date)
);
CREATE INDEX IF NOT EXISTS cal_overrides_org_user_idx ON calendar_availability_overrides(organization_id, user_id);

-- conversations: marcado de favoritos
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT false;

-- tasks: ID de evento Google Calendar vinculado
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- users: color de avatar personalizado
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color TEXT;

-- social_connections: cuentas FB/IG vinculadas
CREATE TABLE IF NOT EXISTS social_connections (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform              TEXT        NOT NULL CHECK (platform IN ('facebook','instagram')),
  page_id               TEXT        NOT NULL,
  page_name             TEXT        NOT NULL,
  page_picture          TEXT,
  access_token          TEXT        NOT NULL,
  token_expires_at      TIMESTAMPTZ,
  instagram_business_id TEXT,
  status                TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','disconnected')),
  webhook_verify_token  TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, platform, page_id)
);
CREATE INDEX IF NOT EXISTS social_connections_org_idx ON social_connections(organization_id);
