-- Campos ricos de oportunidad (estilo GHL) + notas con timestamp.

ALTER TABLE opportunities
  ADD COLUMN source        TEXT,
  ADD COLUMN business_name TEXT,
  ADD COLUMN tags          TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN owner_id      UUID REFERENCES users(id) ON DELETE SET NULL;

-- Notas: múltiples entradas por oportunidad, cada una con su fecha/autor (como GHL).
CREATE TABLE opportunity_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id  UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  author_name     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX opportunity_notes_opp_idx ON opportunity_notes(opportunity_id);
