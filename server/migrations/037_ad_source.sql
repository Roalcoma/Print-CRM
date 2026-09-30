-- Anuncio de Meta (click-to-WhatsApp) del que viene un lead: WhatsApp adjunta
-- externalAdReply al primer mensaje. En el mensaje y, como primer origen, en el contacto.
ALTER TABLE conv_messages ADD COLUMN IF NOT EXISTS ad_ref JSONB;
ALTER TABLE contacts      ADD COLUMN IF NOT EXISTS ad_source JSONB;
