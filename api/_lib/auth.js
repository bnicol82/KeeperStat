import { createRemoteJWKSet, jwtVerify } from "jose";

const AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL;
const JWKS = createRemoteJWKSet(new URL(`${AUTH_BASE_URL}/.well-known/jwks.json`));

// Verifies the request's bearer token against Neon Auth's JWKS and returns
// the authenticated user's id (the JWT `sub` claim), or null if missing/invalid.
export async function getAuthedUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);

  try {
    const { payload } = await jwtVerify(token, JWKS);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(req, res) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}
