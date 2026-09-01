-- Calendarios como entidad propia (múltiples por usuario/organización)
CREATE TABLE IF NOT EXISTS calendars (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  color             TEXT NOT NULL DEFAULT '#F69008',
  slug              TEXT NOT NULL UNIQUE,
  timezone          TEXT NOT NULL DEFAULT 'America/Caracas',
  description       TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  -- Configuración de agendamiento público
  booking_enabled   BOOLEAN NOT NULL DEFAULT false,
  duration_minutes  INTEGER NOT NULL DEFAULT 30,
  buffer_minutes    INTEGER NOT NULL DEFAULT 0,
  min_notice_hours  INTEGER NOT NULL DEFAULT 2,
  max_advance_days  INTEGER NOT NULL DEFAULT 60,
  custom_message    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendars_org  ON calendars(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendars_user ON calendars(user_id);
CREATE INDEX IF NOT EXISTS idx_calendars_slug ON calendars(slug);

-- Disponibilidad por día de la semana para cada calendario
CREATE TABLE IF NOT EXISTS calendar_availability (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id  UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL DEFAULT '09:00',
  end_time     TIME NOT NULL DEFAULT '18:00',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (calendar_id, day_of_week)
);

-- Ligar appointments a un calendario
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calendar_id UUID REFERENCES calendars(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_cal ON appointments(calendar_id);

-- Crear calendario por defecto para cada usuario existente
INSERT INTO calendars (organization_id, user_id, name, color, slug)
SELECT
  u.organization_id,
  u.id,
  u.name,
  '#F69008',
  LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(u.name, '[^a-zA-Z0-9\s]', '', 'g'),
      '\s+', '-', 'g'
    )
  ) || '-' || SUBSTRING(u.id::text, 1, 8)
FROM users u
ON CONFLICT DO NOTHING;

-- Disponibilidad por defecto: lunes a viernes 9am–6pm
INSERT INTO calendar_availability (calendar_id, day_of_week, start_time, end_time)
SELECT c.id, d.dow, '09:00'::time, '18:00'::time
FROM calendars c
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(dow)
ON CONFLICT DO NOTHING;

-- Vincular citas existentes al calendario por defecto de su usuario
UPDATE appointments a
SET calendar_id = c.id
FROM calendars c
WHERE c.user_id = a.user_id
  AND c.organization_id = a.organization_id
  AND a.calendar_id IS NULL;
