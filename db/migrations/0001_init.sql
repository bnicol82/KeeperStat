-- Core schema: one row per goalkeeper profile, one row per tracked match.
-- Static reference content (drills, coach interview questions) stays in the
-- frontend bundle — it isn't user-editable data, so it doesn't need a table.

CREATE TABLE IF NOT EXISTS keepers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  team                TEXT NOT NULL,
  level               TEXT NOT NULL DEFAULT 'youth',
  focus_area_title    TEXT,
  focus_area_note     TEXT,
  next_goal           TEXT,
  show_gmis           BOOLEAN NOT NULL DEFAULT TRUE,
  match_reminders     BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_summary      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keeper_id           UUID NOT NULL REFERENCES keepers(id) ON DELETE CASCADE,
  match_number        INTEGER NOT NULL,
  opponent            TEXT NOT NULL,
  saves               INTEGER NOT NULL DEFAULT 0,
  shots_faced         INTEGER NOT NULL DEFAULT 0,
  goals_against       INTEGER NOT NULL DEFAULT 0,
  result              TEXT NOT NULL,
  goals_scored        INTEGER NOT NULL DEFAULT 0,
  team_shots_on_goal  INTEGER,
  minutes_played      INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (keeper_id, match_number)
);

CREATE INDEX IF NOT EXISTS matches_keeper_id_idx ON matches (keeper_id);
