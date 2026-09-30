-- Plantillas de cuenta: las plantillas viven en código (server/src/templates); aquí solo se
-- registra qué plantilla se aplicó a qué organización, para no aplicarla dos veces.
CREATE TABLE IF NOT EXISTS account_template_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_key    TEXT NOT NULL,
  variables       JSONB NOT NULL DEFAULT '{}',
  created         JSONB NOT NULL DEFAULT '{}',   -- ids de pipelines, calendarios y automatizaciones creados
  applied_by      UUID REFERENCES agency_admins(id) ON DELETE SET NULL,
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, template_key)
);
