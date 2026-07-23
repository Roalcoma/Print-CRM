-- Múltiples responsables por tarea (M2M) + más estados tipo tablero.

CREATE TABLE task_assignees (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX task_assignees_user_idx ON task_assignees(user_id);

-- Migra el responsable único existente a la nueva tabla y elimina la columna.
INSERT INTO task_assignees (task_id, user_id)
  SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL;
ALTER TABLE tasks DROP COLUMN assignee_id;

-- Estados tipo deck: pendiente, en progreso, finalizada, cancelada.
ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled'));
