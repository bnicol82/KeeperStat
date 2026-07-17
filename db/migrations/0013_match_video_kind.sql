-- Distinguishes raw Record Film clips from the auto-generated highlight
-- reel ('clip' vs 'highlights') within a match's stored videos, so the
-- report screen can label the reel instead of presenting it as just
-- another numbered clip.

ALTER TABLE match_videos
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'clip';
