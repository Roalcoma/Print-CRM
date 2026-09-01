ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS is_all_day        BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_type   TEXT     NOT NULL DEFAULT 'none'
    CHECK (recurrence_type IN ('none','daily','weekly','monthly','yearly')),
  ADD COLUMN IF NOT EXISTS recurrence_days   INTEGER[],
  ADD COLUMN IF NOT EXISTS recurrence_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recurrence_count  INTEGER,
  ADD COLUMN IF NOT EXISTS parent_id         UUID REFERENCES appointments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_appointments_parent ON appointments(parent_id);
