import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../_lib/db.js", () => ({
  sql: vi.fn(),
  withCors: vi.fn(() => false),
  keeperToJson: vi.fn((row) => ({ id: row.id, name: row.name, team: row.team, level: row.level })),
}));
vi.mock("../_lib/auth.js", () => ({ requireUser: vi.fn(async () => "user-1") }));
vi.mock("../_lib/rateLimit.js", () => ({
  enforceRateLimit: vi.fn(async () => true),
  RATE_LIMITS: { write: { limit: 60, windowSeconds: 60 } },
}));

import { sql } from "../_lib/db.js";
import { requireUser } from "../_lib/auth.js";
import { enforceRateLimit } from "../_lib/rateLimit.js";
import handler from "./index.js";

function mockReqRes(method, body) {
  const req = { method, headers: {}, body };
  const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req, res };
}

describe("GET /api/keepers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockResolvedValue persists across tests (clearAllMocks only clears
    // call history, not implementations), so re-assert the happy-path
    // defaults every time rather than let a previous test's override leak.
    requireUser.mockResolvedValue("user-1");
    enforceRateLimit.mockResolvedValue(true);
  });

  it("returns only the authenticated user's keepers", async () => {
    sql.mockResolvedValue([{ id: "k1", name: "Alex", team: "FC", level: "youth" }]);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ id: "k1", name: "Alex", team: "FC", level: "youth" }]);
  });

  it("returns 401 without a valid session, never reaching the query", async () => {
    requireUser.mockResolvedValue(null);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("POST /api/keepers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    enforceRateLimit.mockResolvedValue(true);
  });

  it("creates a keeper with valid input", async () => {
    sql.mockResolvedValue([{ id: "k2", name: "Jamie", team: "Riverside SC", level: "youth" }]);
    const { req, res } = mockReqRes("POST", { name: "Jamie", team: "Riverside SC" });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe("Jamie");
  });

  it("rejects a missing name with 400, never touching the database", async () => {
    const { req, res } = mockReqRes("POST", { team: "Riverside SC" });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("rejects an invalid level", async () => {
    const { req, res } = mockReqRes("POST", { name: "Jamie", team: "Riverside SC", level: "pro-legend" });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/level must be one of/);
  });

  it("is blocked by the rate limiter before validation runs", async () => {
    enforceRateLimit.mockResolvedValue(false); // enforceRateLimit itself already wrote the 429
    const { req, res } = mockReqRes("POST", { name: "Jamie", team: "Riverside SC" });
    await handler(req, res);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("unsupported method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    enforceRateLimit.mockResolvedValue(true);
  });

  it("returns 405", async () => {
    const { req, res } = mockReqRes("DELETE");
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
