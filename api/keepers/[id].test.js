import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../_lib/db.js", () => ({
  sql: vi.fn(),
  withCors: vi.fn(() => false),
  keeperToJson: vi.fn((row) => ({ id: row.id, name: row.name, focusArea: row.focus_area_title ? { title: row.focus_area_title, note: row.focus_area_note } : null })),
}));
vi.mock("../_lib/auth.js", () => ({ requireUser: vi.fn(async () => "user-1") }));
vi.mock("../_lib/rateLimit.js", () => ({
  enforceRateLimit: vi.fn(async () => true),
  RATE_LIMITS: { write: { limit: 60, windowSeconds: 60 } },
}));

import { sql } from "../_lib/db.js";
import { requireUser } from "../_lib/auth.js";
import { enforceRateLimit } from "../_lib/rateLimit.js";
import handler from "./[id].js";

function mockReqRes(method, body) {
  const req = { method, headers: {}, query: { id: "k1" }, body };
  const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return { req, res };
}

const existingRow = {
  id: "k1", name: "Alex", team: "FC", level: "youth", photo_url: null, rankings_url: null, is_public: false,
  focus_area_title: "Low Diving Saves", focus_area_note: "Work on it", next_goal: null, show_gmis: true,
  match_reminders: true, weekly_summary: false,
};

describe("PATCH /api/keepers/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    enforceRateLimit.mockResolvedValue(true);
  });

  it("updates a keeper with valid fields", async () => {
    let call = 0;
    sql.mockImplementation(async () => {
      call++;
      if (call === 1) return [existingRow]; // pre-check SELECT
      return [{ ...existingRow, name: "Alexander" }];
    });
    const { req, res } = mockReqRes("PATCH", { name: "Alexander" });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe("Alexander");
  });

  it("clears the whole focus area when focusArea is explicitly null", async () => {
    let call = 0;
    let capturedNext;
    sql.mockImplementation(async (strings, ...values) => {
      call++;
      if (call === 1) return [existingRow];
      // second call is the UPDATE — focus_area_title/note are the 7th/8th
      // interpolated values per the template's column order.
      capturedNext = { focus_area_title: values[6], focus_area_note: values[7] };
      return [{ ...existingRow, focus_area_title: null, focus_area_note: null }];
    });
    const { req, res } = mockReqRes("PATCH", { focusArea: null });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(capturedNext.focus_area_title).toBeNull();
    expect(capturedNext.focus_area_note).toBeNull();
  });

  it("rejects a focusArea object missing a title", async () => {
    const { req, res } = mockReqRes("PATCH", { focusArea: { note: "no title given" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns 404 for a keeper that doesn't exist or isn't owned by this user", async () => {
    sql.mockResolvedValue([]); // pre-check SELECT finds nothing
    const { req, res } = mockReqRes("PATCH", { name: "Alexander" });
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("rejects an invalid nextGoal type", async () => {
    const { req, res } = mockReqRes("PATCH", { nextGoal: 12345 });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/keepers/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue("user-1");
    enforceRateLimit.mockResolvedValue(true);
  });

  it("deletes an existing, owned keeper", async () => {
    sql.mockResolvedValueOnce([{ id: "k1" }]).mockResolvedValueOnce([]);
    const { req, res } = mockReqRes("DELETE");
    await handler(req, res);
    expect(res.statusCode).toBe(204);
  });

  it("returns 404 instead of deleting when the keeper isn't found", async () => {
    sql.mockResolvedValueOnce([]);
    const { req, res } = mockReqRes("DELETE");
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(sql).toHaveBeenCalledTimes(1); // pre-check only — no DELETE issued
  });
});
