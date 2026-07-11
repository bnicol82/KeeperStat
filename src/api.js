const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
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
};
