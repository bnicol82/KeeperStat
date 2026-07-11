-- Imported season schedule rows (upcoming, not-yet-played opponents).
-- Kept separate from `matches`, which only holds games that were actually tracked.

CREATE TABLE IF NOT EXISTS fixtures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keeper_id   UUID NOT NULL REFERENCES keepers(id) ON DELETE CASCADE,
  opponent    TEXT NOT NULL,
  match_date  DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fixtures_keeper_id_idx ON fixtures (keeper_id);
