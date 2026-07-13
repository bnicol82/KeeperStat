-- Backs a fixed-window rate limiter for API write routes and photo uploads.
-- A single shared table (keyed by an arbitrary string) is used across all
-- API routes so every serverless invocation, regardless of instance, sees
-- the same counts.

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL
);
