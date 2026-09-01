-- 021_agency.sql: Backoffice de agencia
-- Tablas para gestionar clientes del CRM como una agencia multi-tenant.

-- Super-admins de la agencia (separados de users de organizaciones)
CREATE TABLE IF NOT EXISTS agency_admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clientes de la agencia (cada cliente = una organización del CRM)
CREATE TABLE IF NOT EXISTS agency_clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  company         TEXT,
  email           TEXT NOT NULL,
  phone           TEXT,
  country         TEXT,
  plan            TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','pro','enterprise')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','trial','suspended','cancelled')),
  trial_ends_at   TIMESTAMPTZ,
  monthly_value   NUMERIC(10,2) DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_clients_org_idx ON agency_clients(organization_id);

-- Log de actividad de la agencia
CREATE TABLE IF NOT EXISTS agency_activity_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID REFERENCES agency_admins(id) ON DELETE SET NULL,
  client_id    UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
