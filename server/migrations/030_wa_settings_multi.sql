-- Soporte para múltiples instancias de WhatsApp por organización.
ALTER TABLE wa_settings ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT 'WhatsApp #1';
ALTER TABLE wa_settings ADD COLUMN IF NOT EXISTS is_default   BOOLEAN NOT NULL DEFAULT true;

-- Eliminar el UNIQUE en organization_id (ahora puede haber varias instancias por org)
ALTER TABLE wa_settings DROP CONSTRAINT IF EXISTS wa_settings_organization_id_key;

-- Índice simple en su lugar
CREATE INDEX IF NOT EXISTS wa_settings_org_idx ON wa_settings(organization_id);
