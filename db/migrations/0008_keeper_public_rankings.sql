-- Lets a keeper profile opt in to appearing on the public (signed-in-only)
-- KeeperStat Rankings leaderboard. Private by default since many profiles
-- belong to minors.

ALTER TABLE keepers
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS keepers_is_public_idx ON keepers (is_public) WHERE is_public;
