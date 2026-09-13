-- 026_account_type.sql
-- Distingue si una cuenta CRM es propia (testing / negocio propio)
-- o de un cliente externo.

ALTER TABLE agency_clients
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'client'
    CHECK (type IN ('own', 'client'));
