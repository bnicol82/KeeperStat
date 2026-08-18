-- Sweeps / smothers: keeper stops that were never shots on target — a 1v1
-- smother, a sweep off a through ball, a block on a cross. Tracked apart from
-- saves so that save % keeps meaning "saves / shots on target".

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS sweeps INTEGER NOT NULL DEFAULT 0;
