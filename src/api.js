import { upload } from "@vercel/blob/client";
import { getAuthToken, refreshAuthToken } from "./authClient.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function fetchWithToken(path, options, token) {
  return fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
}

async function request(path, options) {
  let res = await fetchWithToken(path, options, getAuthToken());
  // The cached token can be missing or stale (expired, or never cached yet
  // because the mobile-Safari session lookup at login was silently dropped)
  // — refresh it once from Neon Auth and retry before giving up.
  if (res.status === 401) {
    res = await fetchWithToken(path, options, await refreshAuthToken());
  }
  if (!res.ok) throw new Error(`${options?.method ?? "GET"} ${path} failed: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export const api = {
  listKeepers: () => request("/api/keepers"),
  createKeeper: (keeper) => request("/api/keepers", { method: "POST", body: JSON.stringify(keeper) }),
  updateKeeper: (id, patch) => request(`/api/keepers/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  listMatches: (keeperId) => request(`/api/keepers/${keeperId}/matches`),
  createMatch: (keeperId, match) => request(`/api/keepers/${keeperId}/matches`, { method: "POST", body: JSON.stringify(match) }),
  updateMatch: (keeperId, matchId, patch) => request(`/api/keepers/${keeperId}/matches/${matchId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteMatch: (keeperId, matchId) => request(`/api/keepers/${keeperId}/matches/${matchId}`, { method: "DELETE" }),
  listFixtures: (keeperId) => request(`/api/keepers/${keeperId}/fixtures`),
  importFixtures: (keeperId, fixtures) => request(`/api/keepers/${keeperId}/fixtures`, { method: "POST", body: JSON.stringify(fixtures) }),
  deleteFixture: (keeperId, fixtureId) => request(`/api/keepers/${keeperId}/fixtures/${fixtureId}`, { method: "DELETE" }),
  uploadKeeperPhoto: async (keeperId, file) => {
    // Always refresh here rather than trusting the cache — uploads are
    // infrequent enough that the extra round trip is cheap, and this avoids
    // needing 401-retry plumbing inside the third-party upload() helper.
    const token = await refreshAuthToken();
    const blob = await upload(`keepers/${keeperId}/${file.name}`, file, {
      access: "public",
      handleUploadUrl: `${BASE_URL}/api/keepers/${keeperId}/photo`,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return blob.url;
  },
};
