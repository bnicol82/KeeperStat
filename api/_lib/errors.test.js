import { describe, it, expect, vi } from "vitest";
import { withErrorHandling } from "./errors.js";

function mockRes() {
  const res = { statusCode: null, body: null, headersSent: false };
  res.status = vi.fn((c) => { res.statusCode = c; return res; });
  res.json = vi.fn((b) => { res.body = b; res.headersSent = true; return res; });
  return res;
}

describe("withErrorHandling", () => {
  it("turns a thrown error into a clean 500", async () => {
    const res = mockRes();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await withErrorHandling(async () => { throw new Error("boom"); })({}, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("leaves a successful response untouched", async () => {
    const res = mockRes();
    await withErrorHandling(async (req, r) => { r.status(200).json({ ok: true }); })({}, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("does not double-write if the handler already responded before throwing", async () => {
    const res = mockRes();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await withErrorHandling(async (req, r) => {
      r.status(404).json({ error: "not found" });
      throw new Error("late throw after response sent");
    })({}, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
    expect(res.status).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
