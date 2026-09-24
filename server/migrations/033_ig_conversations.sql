-- Soporte multi-canal en conversaciones: Instagram DM, Facebook DM además de WhatsApp.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp', 'instagram_dm', 'facebook_dm')),
  ADD COLUMN IF NOT EXISTS social_account_id UUID REFERENCES social_connections(id) ON DELETE SET NULL;
