-- Notificaciones push a la app móvil (FCM).
-- push_tokens: un token FCM por dispositivo. Es del usuario (no de la org): el push lleva el
-- orgId en data y la app cambia de organización al abrirlo. organization_id es solo informativo
-- (la org activa al registrarlo). Al borrar el usuario sus tokens caen por cascade.
CREATE TABLE IF NOT EXISTS push_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  token           TEXT NOT NULL UNIQUE,
  platform        TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  device_name     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

-- Preferencias de push por usuario y organización. Claves: new_lead, new_message, appointment,
-- task, system (boolean). Clave ausente = true. Solo afectan al push: la campanita sigue igual.
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prefs           JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);
