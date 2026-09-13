CREATE TABLE IF NOT EXISTS automation_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_type    TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  run_count       INTEGER NOT NULL DEFAULT 0,
  last_run_at     TIMESTAMPTZ,
  config          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_org ON automation_rules(organization_id);

-- Insertar la automatización de WhatsApp para todas las orgs existentes
INSERT INTO automation_rules (organization_id, trigger_type, name, description, config)
SELECT
  id,
  'whatsapp_new_message',
  'Lead automático por WhatsApp',
  'Cuando un número nuevo escribe al WhatsApp conectado, crea automáticamente un contacto, una oportunidad en la primera etapa del pipeline, una tarea de alta prioridad asignada a todos los usuarios y una notificación de nuevo lead.',
  '{"create_contact": true, "create_opportunity": true, "create_task": true, "create_notification": true}'
FROM organizations
ON CONFLICT DO NOTHING;
