import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../_lib/db.js", () => ({
  sql: vi.fn(),
  withCors: vi.fn(() => false),
  matchVideoToJson: vi.fn((row) => ({ id: row.id, videoUrl: row.video_url, createdAt: row.created_at })),
  ownsKeeper: vi.fn(async () => true),
}));
vi.mock("../../../../_lib/auth.js", () => ({ requireUser: vi.fn(async () => "user-1") }));
vi.mock("../../../../_lib/rateLimit.js", () => ({
  enforceRateLimit: vi.fn(async () => true),
  RATE_LIMITS: { write: { limit: 60, windowSeconds: 60 } },
}));

import { sql, ownsKeeper } from "../../../../_lib/db.js";
import { requireUser } from "../../../../_lib/auth.js";
import { enforceRateLimit } from "../../../../_lib/rateLimit.js";
import handler from "./videos.js";

function mockReqRes(method, body) {
  const req = { method, headers: {}, query: { id: "k1", matchId: "m1" }, body };
  const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req, res };
}

describe("GET /api/keepers/:id/matches/:matchId/videos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    ownsKeeper.mockResolvedValue(true);
    enforceRateLimit.mockResolvedValue(true);
  });

  it("returns every recorded clip for the match, oldest first", async () => {
    sql.mockResolvedValue([
      { id: "v1", video_url: "https://blob/a.webm", created_at: "2026-07-01T00:00:00Z" },
      { id: "v2", video_url: "https://blob/b.webm", created_at: "2026-07-01T00:10:00Z" },
    ]);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].videoUrl).toBe("https://blob/a.webm");
  });

  it("returns 404 for a keeper not owned by this user, never reaching the query", async () => {
    ownsKeeper.mockResolvedValue(false);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("POST /api/keepers/:id/matches/:matchId/videos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    ownsKeeper.mockResolvedValue(true);
    enforceRateLimit.mockResolvedValue(true);
  });

  it("records a newly uploaded clip instead of overwriting a prior one", async () => {
    sql.mockResolvedValue([{ id: "v3", video_url: "https://blob/c.webm", created_at: "2026-07-01T00:20:00Z" }]);
    const { req, res } = mockReqRes("POST", { videoUrl: "https://blob/c.webm" });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.videoUrl).toBe("https://blob/c.webm");
  });

  it("rejects a missing videoUrl with 400, never touching the database", async () => {
    const { req, res } = mockReqRes("POST", {});
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("is blocked by the rate limiter before the insert runs", async () => {
    enforceRateLimit.mockResolvedValue(false);
    const { req, res } = mockReqRes("POST", { videoUrl: "https://blob/c.webm" });
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
