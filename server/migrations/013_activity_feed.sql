CREATE TABLE IF NOT EXISTS activity_feed (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  actor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name      TEXT,
  event_type      TEXT NOT NULL,
  meta            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_feed_entity ON activity_feed(entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_org ON activity_feed(organization_id, created_at DESC);
