-- Índices para las consultas más frecuentes (el runner aplica cada migración en una transacción:
-- sin CONCURRENTLY; las tablas aún son pequeñas y el bloqueo dura poco).

-- Kanban y exportación: WHERE o.organization_id = $1 AND o.pipeline_id = $2
CREATE INDEX IF NOT EXISTS opportunities_org_pipeline_idx ON opportunities (organization_id, pipeline_id);

-- Oportunidades de un contacto (ficha, bandeja, timeline) y borrado de contactos (FK)
CREATE INDEX IF NOT EXISTS opportunities_contact_idx ON opportunities (contact_id);

-- Runs de un contacto ("ya recibió el flujo esta semana") y ON DELETE SET NULL de contacts
CREATE INDEX IF NOT EXISTS automation_runs_contact_idx ON automation_runs (contact_id, automation_id, created_at);

-- Tareas por vencimiento (hoy / atrasadas) dentro de la organización
CREATE INDEX IF NOT EXISTS tasks_org_due_idx ON tasks (organization_id, due_at);

-- Búsqueda del contacto por teléfono en cada mensaje entrante de WhatsApp (wa-webhook.ts linkContact):
-- la expresión debe coincidir exactamente con la de la consulta.
CREATE INDEX IF NOT EXISTS contacts_org_phone_digits_idx
  ON contacts (organization_id, regexp_replace(phone, '\D', '', 'g'));
