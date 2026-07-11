import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

export const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL, {
  adapter: BetterAuthReactAdapter(),
});

const TOKEN_KEY = "keeperstat.authToken";

// The session token is handed to us directly in the sign-in/sign-up
// response body — see Login's submit() — so reading it back out never
// needs a network call, let alone one that depends on a cross-site cookie
// iOS Safari might block. See api/_lib/auth.js for why.
export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setCachedAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
