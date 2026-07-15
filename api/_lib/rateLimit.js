import { sql } from "./db.js";

// Fixed-window rate limiter backed by Postgres (rather than in-memory)
// since Vercel serverless functions don't share memory across instances —
// only a shared store gives correct counts under concurrent invocations.
// The UPSERT is a single atomic statement, so concurrent requests for the
// same key can't race past each other.
async function checkRateLimit(key, { limit, windowSeconds }) {
  const [row] = await sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start <= now() - make_interval(secs => ${windowSeconds})
          THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start <= now() - make_interval(secs => ${windowSeconds})
          THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count
  `;
  return row.count <= limit;
}

export const RATE_LIMITS = {
  write: { limit: 60, windowSeconds: 60 },
  photoUpload: { limit: 10, windowSeconds: 3600 },
  videoUpload: { limit: 20, windowSeconds: 3600 },
};

// Call after requireUser succeeds. Returns true if the request may proceed;
// on false it has already written the 429 response.
export async function enforceRateLimit(res, key, opts) {
  if (await checkRateLimit(key, opts)) return true;
  res.status(429).json({ error: "Too many requests, please slow down and try again shortly" });
  return false;
}
