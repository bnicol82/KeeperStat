import { upload } from "@vercel/blob/client";
import { getAuthToken, setCachedAuthToken } from "./authClient.js";
import { extensionForMimeType } from "./videoRecorder.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

// Registered by App.jsx so a 401 (missing/expired/invalid session) can
// drop the user back to the Welcome screen instead of failing silently.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, options) {
  const token = getAuthToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (res.status === 401) {
    setCachedAuthToken(null);
    onUnauthorized();
    throw new Error(`${options?.method ?? "GET"} ${path} failed: 401`);
  }
  if (!res.ok) throw new Error(`${options?.method ?? "GET"} ${path} failed: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export const api = {
  listKeepers: () => request("/api/keepers"),
  createKeeper: (keeper) => request("/api/keepers", { method: "POST", body: JSON.stringify(keeper) }),
  updateKeeper: (id, patch) => request(`/api/keepers/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteKeeper: (id) => request(`/api/keepers/${id}`, { method: "DELETE" }),
  listMatches: (keeperId) => request(`/api/keepers/${keeperId}/matches`),
  createMatch: (keeperId, match) => request(`/api/keepers/${keeperId}/matches`, { method: "POST", body: JSON.stringify(match) }),
  updateMatch: (keeperId, matchId, patch) => request(`/api/keepers/${keeperId}/matches/${matchId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteMatch: (keeperId, matchId) => request(`/api/keepers/${keeperId}/matches/${matchId}`, { method: "DELETE" }),
  listFixtures: (keeperId) => request(`/api/keepers/${keeperId}/fixtures`),
  importFixtures: (keeperId, fixtures) => request(`/api/keepers/${keeperId}/fixtures`, { method: "POST", body: JSON.stringify(fixtures) }),
  deleteFixture: (keeperId, fixtureId) => request(`/api/keepers/${keeperId}/fixtures/${fixtureId}`, { method: "DELETE" }),
  listRankings: () => request("/api/rankings"),
  listInterviewResponses: (keeperId) => request(`/api/keepers/${keeperId}/interview`),
  saveInterviewResponse: (keeperId, response) => request(`/api/keepers/${keeperId}/interview`, { method: "POST", body: JSON.stringify(response) }),
  uploadKeeperPhoto: async (keeperId, file) => {
    const token = getAuthToken();
    const blob = await upload(`keepers/${keeperId}/${file.name}`, file, {
      access: "public",
      handleUploadUrl: `${BASE_URL}/api/keepers/${keeperId}/photo`,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return blob.url;
  },
  uploadMatchVideo: async (keeperId, matchId, videoBlob) => {
    const token = getAuthToken();
    const ext = extensionForMimeType(videoBlob.type);
    const blob = await upload(`keepers/${keeperId}/matches/${matchId}/game-film.${ext}`, videoBlob, {
      access: "public",
      handleUploadUrl: `${BASE_URL}/api/keepers/${keeperId}/matches/${matchId}/video`,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return blob.url;
  },
};
