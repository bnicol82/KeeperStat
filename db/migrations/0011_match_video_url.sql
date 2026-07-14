-- Per-match link to game footage on an external platform (Trace, Veo, or
-- similar auto-highlight camera/sensor systems used in youth soccer).
-- Neither offers a self-serve public API for third-party apps to pull clips
-- or stats directly (Veo gates its API behind a partner agreement; Trace
-- has none published) — this stores the share link the user pastes in
-- once their highlight reel is ready, same pattern as keepers.rankings_url.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS video_url TEXT;
