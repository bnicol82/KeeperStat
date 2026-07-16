-- A match can now be filmed across multiple separate Record Film sessions
-- (stop filming, keep tracking stats, start a new clip later) — each
-- recorded clip is its own row here rather than overwriting a single
-- matches.video_url column, which could only ever remember the most
-- recent recording. matches.video_url is untouched and keeps its original
-- job: a manually-pasted external highlight link (Trace/Veo/etc), separate
-- from clips recorded in-app.

CREATE TABLE IF NOT EXISTS match_videos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  video_url   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_videos_match_id_idx ON match_videos(match_id);
