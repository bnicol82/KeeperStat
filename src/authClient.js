import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

// `npm audit` flags a critical better-auth vuln here: @neondatabase/auth
// (latest is 0.4.2-beta, checked 2026-07-14) hard-pins the exact vulnerable
// better-auth version with no range, so there's no clean upgrade path yet —
// forcing an override would run Neon's adapter against a better-auth release
// it was never tested with. Investigated and deferred rather than forgotten:
// the 9 advisories are all OAuth-provider/oidc/mcp/admin/org/passkey/SCIM
// issues, and this app only ever calls plain authClient.signIn.email /
// signUp.email (see Login in App.jsx) — none of those plugins are configured
// or reachable from our code. The vulnerable server logic itself also runs
// on Neon's hosted auth service, not in anything we deploy. Revisit once
// @neondatabase/auth ships a release that bumps its better-auth pin.
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
