import { describe, it, expect, vi } from "vitest";
import { withCors, keeperToJson, matchToJson, fixtureToJson, interviewResponseToJson, matchVideoToJson } from "./db.js";

function mockReqRes(origin, method = "GET") {
  const headers = {};
  const req = { headers: { origin }, method };
  const res = {
    statusCode: null,
    ended: false,
    setHeader: vi.fn((k, v) => { headers[k] = v; }),
    status: vi.fn(function (c) { this.statusCode = c; return this; }),
    end: vi.fn(function () { this.ended = true; }),
    headers,
  };
  return { req, res };
}

describe("withCors", () => {
  it("allows the GitHub Pages origin", () => {
    const { req, res } = mockReqRes("https://bnicol82.github.io");
    withCors(req, res);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://bnicol82.github.io");
  });

  it("allows the Vercel production origin", () => {
    const { req, res } = mockReqRes("https://keeperstat.vercel.app");
    withCors(req, res);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://keeperstat.vercel.app");
  });

  it("allows a Vercel preview deployment for this project", () => {
    const { req, res } = mockReqRes("https://keeperstat-git-some-branch-bnicol82.vercel.app");
    withCors(req, res);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://keeperstat-git-some-branch-bnicol82.vercel.app");
  });

  it("does not allow an unrelated project's Vercel deployment", () => {
    const { req, res } = mockReqRes("https://some-other-app.vercel.app");
    withCors(req, res);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("does not allow a lookalike domain", () => {
    const { req, res } = mockReqRes("https://keeperstat.vercel.app.attacker.com");
    withCors(req, res);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("does not allow a missing origin header", () => {
    const { req, res } = mockReqRes(undefined);
    withCors(req, res);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("short-circuits an OPTIONS preflight with 204 and returns true", () => {
    const { req, res } = mockReqRes("https://bnicol82.github.io", "OPTIONS");
    const handled = withCors(req, res);
    expect(handled).toBe(true);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.ended).toBe(true);
  });

  it("returns false for a non-OPTIONS request so the route continues", () => {
    const { req, res } = mockReqRes("https://bnicol82.github.io", "GET");
    expect(withCors(req, res)).toBe(false);
  });
});

describe("fixtureToJson", () => {
  it("formats a DATE column back to YYYY-MM-DD independent of runtime timezone", () => {
    // Regression: @neondatabase/serverless parses a DATE-only column via
    // `new Date(year, monthIndex, day)` (local time, not UTC). Using
    // .toISOString() to read it back re-expresses the moment in UTC, which
    // silently shifts the date whenever the process's timezone isn't UTC.
    // process.env.TZ affects Date's local-time interpretation immediately
    // (no need to relaunch the process), so this simulates the driver's
    // exact construction under a non-UTC runtime timezone.
    const originalTZ = process.env.TZ;
    process.env.TZ = "Asia/Tokyo";
    try {
      const matchDate = new Date(2026, 7, 1); // driver's own construction for DATE '2026-08-01'
      expect(fixtureToJson({ id: "1", opponent: "Harbor FC", match_date: matchDate })).toEqual({
        id: "1",
        opponent: "Harbor FC",
        date: "2026-08-01",
      });
    } finally {
      process.env.TZ = originalTZ;
    }
  });

  it("returns null date when match_date is null", () => {
    expect(fixtureToJson({ id: "1", opponent: "Harbor FC", match_date: null })).toEqual({
      id: "1",
      opponent: "Harbor FC",
      date: null,
    });
  });
});

describe("row-to-JSON mappers", () => {
  it("keeperToJson maps focus area only when a title is set", () => {
    expect(keeperToJson({ id: "1", name: "Alex", team: "FC", level: "youth", focus_area_title: null, focus_area_note: null, notif_prefs: undefined, match_reminders: true, weekly_summary: false }).focusArea).toBeNull();
    expect(keeperToJson({ id: "1", name: "Alex", team: "FC", level: "youth", focus_area_title: "Diving", focus_area_note: "Work on it", match_reminders: true, weekly_summary: false }).focusArea).toEqual({ title: "Diving", note: "Work on it" });
  });

  it("matchToJson maps snake_case DB columns to camelCase", () => {
    const row = {
      id: "1", match_number: 3, opponent: "Harbor FC", saves: 5, shots_faced: 7, goals_against: 1,
      result: "W 2-1", goals_scored: 2, team_shots_on_goal: 8, minutes_played: 70,
      distribution_completed: 4, distribution_attempted: 5, claims: 1, punches: 0,
      penalty_saves: 0, big_saves: 1, errors: 0, notes: "Good game", video_url: "https://traceup.com/games/abc123",
    };
    expect(matchToJson(row)).toEqual({
      id: "1", n: 3, opp: "Harbor FC", saves: 5, shotsFaced: 7, ga: 1, res: "W 2-1",
      goalsScored: 2, teamShotsOnGoal: 8, minutesPlayed: 70, distributionCompleted: 4,
      distributionAttempted: 5, claims: 1, punches: 0, penaltySaves: 0, bigSaves: 1,
      errors: 0, notes: "Good game", videoUrl: "https://traceup.com/games/abc123",
    });
  });

  it("interviewResponseToJson maps snake_case DB columns to camelCase", () => {
    expect(interviewResponseToJson({ tab: "Coach", question_index: 2, answer: "Because" })).toEqual({
      tab: "Coach", questionIndex: 2, answer: "Because",
    });
  });

  it("matchVideoToJson includes the clip-vs-highlights kind", () => {
    expect(matchVideoToJson({ id: "v1", video_url: "https://blob/reel.webm", kind: "highlights", created_at: "2026-07-01T00:00:00Z" })).toEqual({
      id: "v1", videoUrl: "https://blob/reel.webm", kind: "highlights", createdAt: "2026-07-01T00:00:00Z",
    });
  });
});
