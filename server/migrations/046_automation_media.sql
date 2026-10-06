-- Almacén de medios de las automatizaciones (videos/imágenes que se adjuntan a un WhatsApp).
-- El archivo vive en disco (MEDIA_DIR); aquí solo el registro. Se sirve público en /m/:token
-- (Evolution lo descarga por URL), así que el token es aleatorio y no adivinable.
CREATE TABLE IF NOT EXISTS automation_media (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  file_name       TEXT NOT NULL,          -- nombre original (solo para mostrar)
  mime            TEXT NOT NULL,
  size            BIGINT NOT NULL,
  path            TEXT NOT NULL,          -- nombre del archivo dentro de MEDIA_DIR
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_media_org ON automation_media(organization_id);

-- Disparador "Cita: no asistió": marca de que ya se disparó para esta cita (una sola vez por cita)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show_notified_at TIMESTAMPTZ;
