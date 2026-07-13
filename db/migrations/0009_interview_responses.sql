-- Persists Interview & Feedback answers per keeper. Previously these lived
-- only in local component state and vanished on navigation/reload despite
-- the UI claiming they were saved.

CREATE TABLE IF NOT EXISTS interview_responses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keeper_id      UUID NOT NULL REFERENCES keepers(id) ON DELETE CASCADE,
  tab            TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  answer         TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (keeper_id, tab, question_index)
);

CREATE INDEX IF NOT EXISTS interview_responses_keeper_id_idx ON interview_responses (keeper_id);
