import { getAuthToken } from "./authClient.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request(path, options) {
  const token = await getAuthToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
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
};
