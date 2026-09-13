ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS website        TEXT,
  ADD COLUMN IF NOT EXISTS business_email TEXT,
  ADD COLUMN IF NOT EXISTS address        TEXT,
  ADD COLUMN IF NOT EXISTS city           TEXT,
  ADD COLUMN IF NOT EXISTS country        TEXT DEFAULT 'Venezuela',
  ADD COLUMN IF NOT EXISTS industry       TEXT,
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS timezone       TEXT DEFAULT 'America/Caracas',
  ADD COLUMN IF NOT EXISTS currency       TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS logo_url       TEXT;
