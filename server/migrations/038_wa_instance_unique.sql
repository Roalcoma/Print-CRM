-- Cada organización con su propia instancia de Evolution: antes todas nacían con 'crm'
-- (la de VFS), y conectar desde otra cuenta le habría redirigido los mensajes de VFS.
-- Los duplicados conservan el nombre en la fila conectada (o la más antigua); las demás
-- reciben uno propio. Luego la BD impide que dos filas compartan instancia.
WITH ranked AS (
  SELECT id, organization_id,
         row_number() OVER (PARTITION BY instance_name
                            ORDER BY (session_status = 'connected') DESC, created_at) AS rn
  FROM wa_settings
)
UPDATE wa_settings w
SET instance_name = 'rocco-' || left(r.organization_id::text, 8) || '-' || left(md5(w.id::text), 6),
    updated_at = NOW()
FROM ranked r
WHERE r.id = w.id AND r.rn > 1;

ALTER TABLE wa_settings ALTER COLUMN instance_name DROP DEFAULT;
ALTER TABLE wa_settings ALTER COLUMN evo_url SET DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS wa_settings_instance_name_key ON wa_settings (instance_name);
