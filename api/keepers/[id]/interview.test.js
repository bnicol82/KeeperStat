import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../_lib/db.js", () => ({
  sql: vi.fn(),
  withCors: vi.fn(() => false),
  interviewResponseToJson: vi.fn((row) => ({ tab: row.tab, questionIndex: row.question_index, answer: row.answer })),
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
import handler from "./interview.js";

function mockReqRes(method, body) {
  const req = { method, headers: {}, query: { id: "k1" }, body };
  const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req, res };
}

describe("GET /api/keepers/:id/interview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    ownsKeeper.mockResolvedValue(true);
    enforceRateLimit.mockResolvedValue(true);
  });

  it("returns the keeper's interview responses", async () => {
    sql.mockResolvedValue([{ tab: "Coach", question_index: 0, answer: "Great hands" }]);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ tab: "Coach", questionIndex: 0, answer: "Great hands" }]);
  });

  it("returns 404 for a keeper not owned by this user, never reaching the query", async () => {
    ownsKeeper.mockResolvedValue(false);
    const { req, res } = mockReqRes("GET");
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("POST /api/keepers/:id/interview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    ownsKeeper.mockResolvedValue(true);
    enforceRateLimit.mockResolvedValue(true);
  });

  it("upserts a valid answer", async () => {
    sql.mockResolvedValue([{ tab: "Parent", question_index: 2, answer: "Communicates well" }]);
    const { req, res } = mockReqRes("POST", { tab: "Parent", questionIndex: 2, answer: "Communicates well" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.answer).toBe("Communicates well");
  });

  it("rejects an invalid tab", async () => {
    const { req, res } = mockReqRes("POST", { tab: "Referee", questionIndex: 0, answer: "x" });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/tab must be one of/);
    expect(sql).not.toHaveBeenCalled();
  });

  it("rejects a missing questionIndex", async () => {
    const { req, res } = mockReqRes("POST", { tab: "Keeper", answer: "x" });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("treats a null answer as an empty string rather than rejecting it", async () => {
    sql.mockResolvedValue([{ tab: "Keeper", question_index: 1, answer: "" }]);
    const { req, res } = mockReqRes("POST", { tab: "Keeper", questionIndex: 1, answer: null });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it("is blocked by the rate limiter before validation runs", async () => {
    enforceRateLimit.mockResolvedValue(false);
    const { req, res } = mockReqRes("POST", { tab: "Coach", questionIndex: 0, answer: "x" });
    await handler(req, res);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("unsupported method", () => {
  it("returns 405", async () => {
    requireUser.mockResolvedValue("user-1");
    ownsKeeper.mockResolvedValue(true);
    const { req, res } = mockReqRes("DELETE");
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
