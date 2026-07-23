-- Tareas: asignables a cualquier usuario, con fecha de vencimiento y opcionalmente
-- vinculadas a una oportunidad.
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  opportunity_id  UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  due_at          TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  completed_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_org_idx      ON tasks(organization_id);
CREATE INDEX tasks_assignee_idx ON tasks(assignee_id);
CREATE INDEX tasks_opp_idx      ON tasks(opportunity_id);
