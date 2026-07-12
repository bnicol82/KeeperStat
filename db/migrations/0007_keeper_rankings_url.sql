-- Per-keeper link to their profile on an external rankings site (e.g.
-- usasportstatistics.net). There's no API for these sites, so this just
-- stores the URL the user pastes in and the app opens/embeds it.

ALTER TABLE keepers
  ADD COLUMN IF NOT EXISTS rankings_url TEXT;
