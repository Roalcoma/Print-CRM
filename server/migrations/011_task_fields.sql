-- Tipo, prioridad y recordatorio en tareas.
ALTER TABLE tasks
  ADD COLUMN task_type TEXT,
  ADD COLUMN priority  TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN reminder  TEXT,
  ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('high', 'medium', 'low')),
  ADD CONSTRAINT tasks_reminder_check  CHECK (reminder  IN ('15min', '30min', '1h', '2h', '1d', '2d', '1w'));
