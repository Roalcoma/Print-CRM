-- 025_user_organizations.sql
-- Permite que un usuario pertenezca a múltiples organizaciones.
-- organization_id en users queda como org de registro (primaria); el acceso
-- real a cada org se lee de esta tabla.

CREATE TABLE IF NOT EXISTS user_organizations (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS user_orgs_org_idx ON user_organizations(organization_id);

-- Retroactivamente registra cada usuario en su org primaria actual.
INSERT INTO user_organizations (user_id, organization_id, role)
SELECT id, organization_id, role
FROM   users
ON CONFLICT DO NOTHING;
