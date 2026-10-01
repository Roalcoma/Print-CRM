-- 040_users_perms_password.sql
-- 1) Obligar a cambiar la contraseña temporal (creada por la agencia o por un admin).
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- 2) Nuevos módulos restringibles: calendar, conversations, automations.
-- Compatibilidad: los miembros existentes los conservan (antes los veía cualquiera).
UPDATE users
SET permissions = (
  SELECT jsonb_agg(DISTINCT k)
  FROM jsonb_array_elements_text(permissions || '["calendar","conversations","automations"]'::jsonb) AS k
)
WHERE role = 'member';
