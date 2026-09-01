-- Módulo de conversaciones WhatsApp (vía OpenWA).
-- Cada organización configura su instancia de OpenWA.

-- Configuración de WhatsApp por organización.
CREATE TABLE wa_settings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  openwa_url        TEXT        NOT NULL DEFAULT 'http://localhost:2785',
  openwa_api_key    TEXT        NOT NULL DEFAULT '',
  openwa_session_id TEXT        NOT NULL DEFAULT 'default',
  session_status    TEXT        NOT NULL DEFAULT 'disconnected',
  webhook_secret    TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un hilo de conversación = un chat de WhatsApp.
CREATE TABLE conversations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id          UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  wa_chat_id          TEXT        NOT NULL,    -- "5841XXXXXXXX@c.us"
  display_name        TEXT        NOT NULL,    -- nombre WA o número de teléfono
  phone               TEXT,
  avatar_url          TEXT,
  last_message_at     TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count        INT         NOT NULL DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'open',  -- open | closed | archived
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, wa_chat_id)
);

CREATE INDEX conversations_org_idx      ON conversations(organization_id);
CREATE INDEX conversations_contact_idx  ON conversations(contact_id);
CREATE INDEX conversations_status_idx   ON conversations(organization_id, status);
CREATE INDEX conversations_last_msg_idx ON conversations(organization_id, last_message_at DESC NULLS LAST);

-- Mensajes individuales dentro de cada conversación.
CREATE TABLE conv_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wa_message_id   TEXT        UNIQUE,          -- ID de WA para deduplicación
  direction       TEXT        NOT NULL,         -- 'inbound' | 'outbound'
  msg_type        TEXT        NOT NULL DEFAULT 'text',  -- text|image|audio|video|document|sticker
  body            TEXT,
  media_url       TEXT,
  media_mime      TEXT,
  media_filename  TEXT,
  status          TEXT        NOT NULL DEFAULT 'sent',  -- sent|delivered|read|failed
  sender_name     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX conv_messages_conv_idx ON conv_messages(conversation_id, created_at);
CREATE INDEX conv_messages_org_idx  ON conv_messages(organization_id);
