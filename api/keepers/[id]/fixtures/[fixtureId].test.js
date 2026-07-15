import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../_lib/db.js", () => ({
  sql: vi.fn(),
  withCors: vi.fn(() => false),
  ownsKeeper: vi.fn(async () => true),
}));
vi.mock("../../../_lib/auth.js", () => ({ requireUser: vi.fn(async () => "user-1") }));
vi.mock("../../../_lib/rateLimit.js", () => ({
  enforceRateLimit: vi.fn(async () => true),
  RATE_LIMITS: { write: { limit: 60, windowSeconds: 60 } },
}));

import { sql, ownsKeeper } from "../../../_lib/db.js";
import { requireUser } from "../../../_lib/auth.js";
import { enforceRateLimit } from "../../../_lib/rateLimit.js";
import handler from "./[fixtureId].js";

function mockReqRes(method) {
  const req = { method, headers: {}, query: { id: "k1", fixtureId: "f1" } };
  const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req, res };
}

describe("DELETE /api/keepers/:id/fixtures/:fixtureId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    ownsKeeper.mockResolvedValue(true);
    enforceRateLimit.mockResolvedValue(true);
    sql.mockResolvedValue([]);
  });

  it("deletes the fixture and returns 204", async () => {
    const { req, res } = mockReqRes("DELETE");
    await handler(req, res);
    expect(res.statusCode).toBe(204);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for a keeper not owned by this user, never issuing the delete", async () => {
    ownsKeeper.mockResolvedValue(false);
    const { req, res } = mockReqRes("DELETE");
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });

  it("is blocked by the rate limiter before the delete runs", async () => {
    enforceRateLimit.mockResolvedValue(false);
    const { req, res } = mockReqRes("DELETE");
    await handler(req, res);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("unsupported method", () => {
  it("returns 405", async () => {
    requireUser.mockResolvedValue("user-1");
    ownsKeeper.mockResolvedValue(true);
    const { req, res } = mockReqRes("PATCH");
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
