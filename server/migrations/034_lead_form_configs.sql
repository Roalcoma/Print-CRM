-- Configuración de formularios de Facebook Lead Ads por organización.
-- Cada fila mapea un form_id de Meta a un pipeline/etapa y define
-- cómo traducir los campos del formulario a campos del contacto.
CREATE TABLE IF NOT EXISTS lead_form_configs (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  social_connection_id   UUID        NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  form_id                TEXT        NOT NULL,
  form_name              TEXT        NOT NULL DEFAULT '',
  pipeline_id            UUID        REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id               UUID        REFERENCES stages(id)   ON DELETE SET NULL,
  field_map              JSONB       NOT NULL DEFAULT '{}',
  auto_create_contact    BOOLEAN     NOT NULL DEFAULT TRUE,
  auto_create_opportunity BOOLEAN    NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, form_id)
);
