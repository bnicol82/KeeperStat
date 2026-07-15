import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db.js", () => ({ sql: vi.fn() }));

import { sql } from "./db.js";
import { enforceRateLimit, RATE_LIMITS } from "./rateLimit.js";

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = vi.fn((c) => { res.statusCode = c; return res; });
  res.json = vi.fn((b) => { res.body = b; return res; });
  return res;
}

describe("enforceRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows the request when the count is under the limit", async () => {
    sql.mockResolvedValue([{ count: 5 }]);
    const res = mockRes();
    const allowed = await enforceRateLimit(res, "write:user1", RATE_LIMITS.write);
    expect(allowed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows the request when the count is exactly at the limit (inclusive boundary)", async () => {
    sql.mockResolvedValue([{ count: RATE_LIMITS.write.limit }]);
    const res = mockRes();
    const allowed = await enforceRateLimit(res, "write:user1", RATE_LIMITS.write);
    expect(allowed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks the request with a 429 once the count exceeds the limit", async () => {
    sql.mockResolvedValue([{ count: RATE_LIMITS.write.limit + 1 }]);
    const res = mockRes();
    const allowed = await enforceRateLimit(res, "write:user1", RATE_LIMITS.write);
    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: "Too many requests, please slow down and try again shortly" });
  });

  it("scopes the limit independently per key", async () => {
    // Two different keys (e.g. two different users, or write vs. photoUpload
    // for the same user) must not share a counter — confirmed by checking
    // the key actually passed through to the query each time.
    sql.mockResolvedValue([{ count: 1 }]);
    const res = mockRes();
    await enforceRateLimit(res, "write:user1", RATE_LIMITS.write);
    await enforceRateLimit(res, "photo:user1", RATE_LIMITS.photoUpload);
    expect(sql).toHaveBeenCalledTimes(2);
    // Both calls used a tagged-template invocation; confirm the interpolated
    // key value differed between them (second templated arg after the
    // strings array is `key`).
    const firstKeyArg = sql.mock.calls[0][1];
    const secondKeyArg = sql.mock.calls[1][1];
    expect(firstKeyArg).toBe("write:user1");
    expect(secondKeyArg).toBe("photo:user1");
  });
});

describe("RATE_LIMITS", () => {
  it("defines sane, non-zero limits for both buckets", () => {
    expect(RATE_LIMITS.write.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.write.windowSeconds).toBeGreaterThan(0);
    expect(RATE_LIMITS.photoUpload.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.photoUpload.windowSeconds).toBeGreaterThan(0);
  });
});
