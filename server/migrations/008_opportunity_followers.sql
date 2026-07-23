-- Seguidores de una oportunidad (usuarios que la siguen). Muchos-a-muchos.
CREATE TABLE opportunity_followers (
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, user_id)
);
CREATE INDEX opportunity_followers_opp_idx ON opportunity_followers(opportunity_id);
