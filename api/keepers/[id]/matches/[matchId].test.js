import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../_lib/db.js", () => ({
  sql: vi.fn(),
  withCors: vi.fn(() => false),
  matchToJson: vi.fn((row) => ({ id: row.id, videoUrl: row.video_url })),
  ownsKeeper: vi.fn(async () => true),
}));
vi.mock("../../../_lib/auth.js", () => ({
  requireUser: vi.fn(async () => "user-1"),
}));
vi.mock("../../../_lib/rateLimit.js", () => ({
  enforceRateLimit: vi.fn(async () => true),
  RATE_LIMITS: { write: { limit: 60, windowSeconds: 60 } },
}));

import { sql } from "../../../_lib/db.js";
import handler from "./[matchId].js";

function mockReqRes(body) {
  const req = { method: "PATCH", headers: {}, query: { id: "k1", matchId: "m1" }, body };
  const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req, res };
}

describe("PATCH /api/keepers/:id/matches/:matchId — video_url migration resilience", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retries without video_url when the column doesn't exist yet, so other fields still save", async () => {
    const existingRow = {
      id: "m1", opponent: "Old Opp", saves: 1, shots_faced: 2, goals_against: 1, result: "L 0-1",
      goals_scored: 0, team_shots_on_goal: null, minutes_played: null, distribution_completed: 0,
      distribution_attempted: 0, claims: 0, punches: 0, penalty_saves: 0, big_saves: 0, errors: 0,
      notes: null, video_url: null,
    };
    let call = 0;
    sql.mockImplementation(async (strings) => {
      call++;
      if (call === 1) return [existingRow]; // pre-check SELECT
      if (call === 2) {
        // First UPDATE attempt (includes video_url) — simulate the column
        // not existing yet in this environment.
        const err = new Error('column "video_url" of relation "matches" does not exist');
        err.code = "42703";
        throw err;
      }
      // Retry UPDATE without video_url — succeeds, notes did update.
      return [{ ...existingRow, notes: "Updated notes", video_url: null }];
    });

    const { req, res } = mockReqRes({ notes: "Updated notes", videoUrl: "https://traceup.com/x" });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.videoUrl).toBeNull(); // didn't persist — column doesn't exist yet
    expect(call).toBe(3); // pre-check SELECT, failed UPDATE, retried UPDATE
  });

  it("does not mask an unrelated database error as a successful retry", async () => {
    const existingRow = { id: "m1", opponent: "Old Opp", saves: 1, shots_faced: 2, goals_against: 1, result: "L 0-1", goals_scored: 0, team_shots_on_goal: null, minutes_played: null, distribution_completed: 0, distribution_attempted: 0, claims: 0, punches: 0, penalty_saves: 0, big_saves: 0, errors: 0, notes: null, video_url: null };
    let call = 0;
    sql.mockImplementation(async () => {
      call++;
      if (call === 1) return [existingRow];
      const err = new Error("connection terminated unexpectedly");
      err.code = "57P01";
      throw err;
    });

    const { req, res } = mockReqRes({ notes: "Updated notes" });
    await handler(req, res); // withErrorHandling catches it — verify it wasn't silently retried as if it were the video_url case
    expect(res.statusCode).toBe(500);
    expect(call).toBe(2); // no retry attempt for an unrelated error code
  });

  it("succeeds normally on the first attempt when the column exists", async () => {
    const existingRow = { id: "m1", opponent: "Old Opp", saves: 1, shots_faced: 2, goals_against: 1, result: "L 0-1", goals_scored: 0, team_shots_on_goal: null, minutes_played: null, distribution_completed: 0, distribution_attempted: 0, claims: 0, punches: 0, penalty_saves: 0, big_saves: 0, errors: 0, notes: null, video_url: null };
    let call = 0;
    sql.mockImplementation(async () => {
      call++;
      if (call === 1) return [existingRow];
      return [{ ...existingRow, video_url: "https://traceup.com/x" }];
    });

    const { req, res } = mockReqRes({ videoUrl: "https://traceup.com/x" });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.videoUrl).toBe("https://traceup.com/x");
    expect(call).toBe(2); // pre-check SELECT, single successful UPDATE — no retry needed
  });
});
