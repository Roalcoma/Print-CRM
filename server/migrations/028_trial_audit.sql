-- 028_trial_audit.sql

-- Trial configurable por plan (días de prueba por defecto; NULL = ilimitado)
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS trial_days INT DEFAULT 7;

UPDATE plans SET trial_days = NULL WHERE slug = 'free';

-- Trial override por cuenta (NULL = usar el del plan; 0 = ilimitado)
ALTER TABLE agency_clients
  ADD COLUMN IF NOT EXISTS trial_days_override INT DEFAULT NULL;

-- Auditoría de acciones dentro de cada CRM (por organización)
CREATE TABLE IF NOT EXISTS crm_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id       UUID,
  user_name     TEXT,
  action        TEXT NOT NULL,          -- 'contact.created', 'opportunity.stage_changed', etc.
  entity_type   TEXT,                   -- 'contact', 'opportunity', 'task', 'user', 'pipeline'
  entity_id     UUID,
  entity_name   TEXT,                   -- nombre legible del registro afectado
  details       JSONB,
  ip            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_audit_org_idx  ON crm_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_audit_user_idx ON crm_audit_log(user_id);
