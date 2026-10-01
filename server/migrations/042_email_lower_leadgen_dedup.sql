-- 042_email_lower_leadgen_dedup.sql
-- 1) Emails sin distinguir mayúsculas: el login compara lower(email).
--    Se normalizan a minúsculas/sin espacios los que no choquen con otro ya existente
--    (si dos cuentas solo difieren en mayúsculas, se dejan tal cual para no romper la unicidad).
UPDATE users u SET email = lower(trim(u.email))
WHERE u.email <> lower(trim(u.email))
  AND NOT EXISTS (SELECT 1 FROM users o WHERE o.id <> u.id AND lower(trim(o.email)) = lower(trim(u.email)));

UPDATE agency_admins a SET email = lower(trim(a.email))
WHERE a.email <> lower(trim(a.email))
  AND NOT EXISTS (SELECT 1 FROM agency_admins o WHERE o.id <> a.id AND lower(trim(o.email)) = lower(trim(a.email)));

UPDATE agency_clients SET email = lower(trim(email)) WHERE email <> lower(trim(email));

-- Índice sobre lower(email) para el login: único solo si no hay duplicados previos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users GROUP BY lower(email) HAVING count(*) > 1) THEN
    CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
  END IF;
  IF EXISTS (SELECT 1 FROM agency_admins GROUP BY lower(email) HAVING count(*) > 1) THEN
    CREATE INDEX IF NOT EXISTS idx_agency_admins_email_lower ON agency_admins (lower(email));
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_admins_email_lower ON agency_admins (lower(email));
  END IF;
END $$;

-- 2) Lead Ads: leadgen_id ya procesados por organización (Meta puede reenviar el mismo lead)
CREATE TABLE IF NOT EXISTS processed_leadgens (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  leadgen_id      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, leadgen_id)
);
