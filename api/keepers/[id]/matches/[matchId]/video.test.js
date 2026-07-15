import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@vercel/blob/client", () => ({ handleUpload: vi.fn() }));
vi.mock("../../../../_lib/db.js", () => ({
  withCors: vi.fn(() => false),
  ownsKeeper: vi.fn(async () => true),
}));
vi.mock("../../../../_lib/auth.js", () => ({ requireUser: vi.fn(async () => "user-1") }));
vi.mock("../../../../_lib/rateLimit.js", () => ({
  enforceRateLimit: vi.fn(async () => true),
  RATE_LIMITS: { videoUpload: { limit: 20, windowSeconds: 3600 } },
}));

import { handleUpload } from "@vercel/blob/client";
import { ownsKeeper } from "../../../../_lib/db.js";
import { requireUser } from "../../../../_lib/auth.js";
import { enforceRateLimit } from "../../../../_lib/rateLimit.js";
import handler from "./video.js";

function mockReqRes(body) {
  const req = { method: "POST", headers: {}, query: { id: "k1", matchId: "m1" }, body };
  const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req, res };
}

describe("POST /api/keepers/:id/matches/:matchId/video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    ownsKeeper.mockResolvedValue(true);
    enforceRateLimit.mockResolvedValue(true);
  });

  it("generates an upload token scoped to this match's path", async () => {
    handleUpload.mockResolvedValue({ type: "blob.generate-client-token", clientToken: "tok" });
    const { req, res } = mockReqRes({ type: "blob.generate-client-token", payload: {} });
    await handler(req, res);
    expect(res.statusCode).toBe(200);

    const opts = handleUpload.mock.calls[0][0];
    const grant = await opts.onBeforeGenerateToken(`keepers/k1/matches/m1/game-film.webm`);
    expect(grant.allowedContentTypes).toContain("video/webm");
    await expect(opts.onBeforeGenerateToken("keepers/k1/other/place.webm")).rejects.toThrow("Invalid upload path");
  });

  it("returns 404 for a keeper not owned by this user, never generating a token", async () => {
    ownsKeeper.mockResolvedValue(false);
    const { req, res } = mockReqRes({});
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(handleUpload).not.toHaveBeenCalled();
  });

  it("is blocked by the rate limiter before generating a token", async () => {
    enforceRateLimit.mockResolvedValue(false);
    const { req, res } = mockReqRes({});
    await handler(req, res);
    expect(handleUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when handleUpload rejects (e.g. an oversized or wrong-type file)", async () => {
    handleUpload.mockRejectedValue(new Error("file too large"));
    const { req, res } = mockReqRes({});
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("file too large");
  });
});
