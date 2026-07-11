-- Adds keeper-specific stats beyond the original save/shot/goal counters,
-- plus a free-text notes field for lower-priority situational stats
-- (sweeper actions, 1v1 duels, etc.) that don't warrant their own tap
-- counter on the live tracker.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS distribution_completed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distribution_attempted INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claims          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS punches         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_saves   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS big_saves       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes           TEXT;
