import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

export const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL, {
  adapter: BetterAuthReactAdapter(),
});

const TOKEN_KEY = "keeperstat.authToken";

export function getCachedAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setCachedAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Looking up the session is a cross-site request from this app's origin to
// Neon Auth's domain. Mobile Safari's Intelligent Tracking Prevention can
// silently drop the cookie that depends on — desktop browsers are much more
// lenient, which is why this only breaks on phones. We fetch it explicitly
// at sign-in and on session resume, then cache it, instead of re-fetching
// (and re-risking ITP) before every single API call.
export async function refreshAuthToken() {
  const { data } = await authClient.getSession();
  const token = data?.session?.token ?? null;
  setCachedAuthToken(token);
  return token;
}

export function getAuthToken() {
  return getCachedAuthToken();
}
