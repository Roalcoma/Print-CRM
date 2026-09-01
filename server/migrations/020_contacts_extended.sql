-- 020_contacts_extended.sql
-- Extend contacts table with professional CRM fields

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_secondary TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_secondary TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS twitter TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','inactive','blocked'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_color TEXT;

CREATE TABLE IF NOT EXISTS contact_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
