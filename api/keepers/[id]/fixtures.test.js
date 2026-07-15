import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../_lib/db.js", () => ({
  sql: vi.fn(),
  withCors: vi.fn(() => false),
  fixtureToJson: vi.fn((row) => ({ id: row.id, opponent: row.opponent, date: row.match_date })),
  ownsKeeper: vi.fn(async () => true),
}));
vi.mock("../../_lib/auth.js", () => ({ requireUser: vi.fn(async () => "user-1") }));
vi.mock("../../_lib/rateLimit.js", () => ({
  enforceRateLimit: vi.fn(async () => true),
  RATE_LIMITS: { write: { limit: 60, windowSeconds: 60 } },
}));

import { sql, ownsKeeper } from "../../_lib/db.js";
import { requireUser } from "../../_lib/auth.js";
import { enforceRateLimit } from "../../_lib/rateLimit.js";
import handler from "./fixtures.js";

function mockReqRes(method, body) {
  const req = { method, headers: {}, query: { id: "k1" }, body };
  const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req, res };
}

describe("GET /api/keepers/:id/fixtures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    ownsKeeper.mockResolvedValue(true);
    enforceRateLimit.mockResolvedValue(true);
  });

  it("returns the keeper's fixtures", async () => {
    sql.mockResolvedValue([{ id: "f1", opponent: "Riverside", match_date: "2026-08-01" }]);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ id: "f1", opponent: "Riverside", date: "2026-08-01" }]);
  });

  it("returns 404 for a keeper not owned by this user, never reaching the query", async () => {
    ownsKeeper.mockResolvedValue(false);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("POST /api/keepers/:id/fixtures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    ownsKeeper.mockResolvedValue(true);
    enforceRateLimit.mockResolvedValue(true);
  });

  it("bulk-inserts valid rows and skips invalid ones", async () => {
    sql.mockImplementation(async (strings, ...values) => {
      // Only called for rows that survived filtering.
      return [{ id: `f-${values[0]}`, opponent: values[1], match_date: values[2] }];
    });
    const { req, res } = mockReqRes("POST", [
      { opponent: "Riverside", date: "2026-08-01" },
      { opponent: "", date: "2026-08-02" }, // missing opponent — skipped
      { opponent: "Lakeside", date: "not-a-date" }, // bad date — skipped
      { opponent: "Hilltop", date: "2026-08-03" },
    ]);
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveLength(2);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty or all-invalid batch with 400, never touching the database", async () => {
    const { req, res } = mockReqRes("POST", [{ opponent: "", date: "bad" }]);
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("rejects a non-array body with 400", async () => {
    const { req, res } = mockReqRes("POST", { opponent: "Riverside", date: "2026-08-01" });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("is blocked by the rate limiter before any inserts run", async () => {
    enforceRateLimit.mockResolvedValue(false);
    const { req, res } = mockReqRes("POST", [{ opponent: "Riverside", date: "2026-08-01" }]);
    await handler(req, res);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("unsupported method", () => {
  it("returns 405", async () => {
    requireUser.mockResolvedValue("user-1");
    ownsKeeper.mockResolvedValue(true);
    const { req, res } = mockReqRes("PUT");
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
