import { sql } from "./db.js";

// Validates the request's bearer token by looking it up directly in Neon
// Auth's own session table (queryable in our same Neon database) and
// returns the associated user's id, or null if missing/invalid/expired.
//
// This intentionally avoids Neon Auth's HTTP session-lookup endpoints
// (getSession()/token), which depend on a cookie set on Neon Auth's own
// domain — a cross-site cookie from this app's origin that iOS Safari
// blocks under Intelligent Tracking Prevention (and standalone "Add to
// Home Screen" apps run with ITP forced on regardless of the user's actual
// Safari settings). The session token itself is handed to the client
// directly in the sign-in/sign-up response body, so no cookie is ever
// needed to use it.
export async function getAuthedUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  if (!token) return null;

  const [row] = await sql`
    SELECT "userId" FROM neon_auth.session WHERE token = ${token} AND "expiresAt" > now()
  `;
  return row?.userId ?? null;
}

export async function requireUser(req, res) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}
