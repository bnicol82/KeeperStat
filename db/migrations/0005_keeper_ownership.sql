-- Ties keeper profiles to a Neon Auth user so real accounts each see only
-- their own data. The legacy seed keeper (00000000-0000-0000-0000-000000000001)
-- keeps user_id NULL — it's inert now that the Welcome screen's demo mode
-- runs entirely client-side rather than reading it through the API.

ALTER TABLE keepers
  ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE INDEX IF NOT EXISTS keepers_user_id_idx ON keepers (user_id);
