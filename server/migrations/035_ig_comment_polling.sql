-- Polling de comentarios de Instagram (Standard Access no recibe webhooks de `comments`).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ig_sender_id TEXT;
CREATE INDEX IF NOT EXISTS contacts_ig_sender_idx ON contacts (organization_id, ig_sender_id);

-- Momento desde el que se procesan comentarios (se fija en el primer poll para no disparar sobre históricos).
ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS comments_polled_at TIMESTAMPTZ;

-- Dedupe compartido entre polling y webhook.
CREATE TABLE IF NOT EXISTS ig_processed_comments (
  comment_id    TEXT PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
