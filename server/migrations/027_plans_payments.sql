-- 027_plans_payments.sql
-- Catálogo de planes, pagos manuales por cuenta y regalías.

CREATE TABLE IF NOT EXISTS plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  price_usd   NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_users   INT  NOT NULL DEFAULT 0,  -- usuarios extra además del owner (0 = solo owner)
  features    JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plans (name, slug, price_usd, max_users, sort_order) VALUES
  ('Free',       'free',       0,  0,   0),
  ('Starter',    'starter',    15, 3,   1),
  ('Pro',        'pro',        49, 10,  2),
  ('Enterprise', 'enterprise', 99, 999, 3)
ON CONFLICT (slug) DO NOTHING;

-- Vincula cada cuenta CRM a un plan del catálogo y soporta regalías.
ALTER TABLE agency_clients
  ADD COLUMN IF NOT EXISTS plan_id             UUID REFERENCES plans(id),
  ADD COLUMN IF NOT EXISTS courtesy_extra_users INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS courtesy_full_access BOOLEAN NOT NULL DEFAULT false;

-- Migra el campo `plan` TEXT existente al nuevo plan_id
UPDATE agency_clients ac
SET    plan_id = p.id
FROM   plans p
WHERE  p.slug = ac.plan
  AND  ac.plan_id IS NULL;

-- Pagos manuales por cuenta.
CREATE TABLE IF NOT EXISTS agency_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  amount_usd   NUMERIC(10,2) NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','paid','overdue','cancelled')),
  method       TEXT,           -- 'transfer', 'efectivo', 'stripe', etc.
  period_start DATE,
  period_end   DATE,
  paid_at      TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_payments_client_idx ON agency_payments(client_id);
