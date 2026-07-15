import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./_lib/db.js", () => ({
  sql: vi.fn(),
  withCors: vi.fn(() => false),
}));
vi.mock("./_lib/auth.js", () => ({ requireUser: vi.fn(async () => "user-1") }));

import { sql } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import handler from "./rankings.js";

function mockReqRes(method) {
  const req = { method, headers: {} };
  const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req, res };
}

describe("GET /api/rankings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
  });

  it("requires sign-in but is not scoped to keepers the caller owns", async () => {
    requireUser.mockResolvedValue(null);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(sql).not.toHaveBeenCalled();
  });

  it("excludes keepers with fewer than 3 matches", async () => {
    sql.mockResolvedValue([
      { keeper_id: "k1", name: "Alex Rivera", team: "FC", level: "youth", shots_faced: 5, saves: 4, goals_against: 1 },
      { keeper_id: "k1", name: "Alex Rivera", team: "FC", level: "youth", shots_faced: 6, saves: 5, goals_against: 1 },
    ]);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("includes keepers with 3+ matches, sorted by score descending, with a privacy-safe display name", async () => {
    const rowsFor = (keeperId, name, level, matches) =>
      matches.map((m) => ({ keeper_id: keeperId, name, team: "FC", level, ...m }));
    sql.mockResolvedValue([
      ...rowsFor("k1", "Alex Rivera", "youth", [
        { shots_faced: 5, saves: 4, goals_against: 1 },
        { shots_faced: 6, saves: 5, goals_against: 1 },
        { shots_faced: 4, saves: 3, goals_against: 1 },
      ]),
      ...rowsFor("k2", "Jamie Cho", "youth", [
        { shots_faced: 5, saves: 1, goals_against: 4 },
        { shots_faced: 6, saves: 2, goals_against: 4 },
        { shots_faced: 4, saves: 1, goals_against: 3 },
      ]),
    ]);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe("k1"); // higher save rate ranks first
    expect(res.body[0].displayName).toBe("Alex R.");
    expect(res.body[0].matchesPlayed).toBe(3);
    expect(res.body[1].displayName).toBe("Jamie C.");
  });

  it("falls back to the youth baseline for an unrecognized level, and uses a single-word name as-is", async () => {
    sql.mockResolvedValue([
      { keeper_id: "k1", name: "Cher", level: "made-up-level", team: null, shots_faced: 5, saves: 4, goals_against: 1 },
      { keeper_id: "k1", name: "Cher", level: "made-up-level", team: null, shots_faced: 6, saves: 5, goals_against: 1 },
      { keeper_id: "k1", name: "Cher", level: "made-up-level", team: null, shots_faced: 4, saves: 3, goals_against: 1 },
    ]);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body[0].displayName).toBe("Cher"); // single-word name is used as-is
  });

  it("returns 405 for non-GET methods", async () => {
    const { req, res } = mockReqRes("POST");
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(sql).not.toHaveBeenCalled();
  });
});
