CREATE TABLE IF NOT EXISTS appointment_attendees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  email           TEXT,
  name            TEXT,
  response_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (response_status IN ('pending','accepted','declined')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appt_attendees_appt ON appointment_attendees(appointment_id);
