-- The keeper's own attacking contributions per match: goals they scored
-- themselves (tracked separately from — but included in — the team's
-- goals_scored total), assists, and hockey assists (the pass before the
-- assist). These feed the GK Impact Score's attacking bonus.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS gk_goals       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assists        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hockey_assists INTEGER NOT NULL DEFAULT 0;
