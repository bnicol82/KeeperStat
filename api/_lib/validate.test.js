import { describe, it, expect, vi } from "vitest";
import { validString, validInt, validBoolean, validDateString, validStatCount, badRequest } from "./validate.js";

describe("validString", () => {
  it("allows undefined/null when not required", () => {
    expect(validString(undefined)).toBe(true);
    expect(validString(null)).toBe(true);
  });
  it("rejects undefined/null when required", () => {
    expect(validString(undefined, { required: true })).toBe(false);
    expect(validString(null, { required: true })).toBe(false);
  });
  it("rejects non-strings", () => {
    expect(validString(42)).toBe(false);
    expect(validString({})).toBe(false);
    expect(validString([])).toBe(false);
  });
  it("rejects strings longer than maxLength", () => {
    expect(validString("a".repeat(256))).toBe(false);
    expect(validString("a".repeat(255))).toBe(true);
    expect(validString("a".repeat(10), { maxLength: 5 })).toBe(false);
  });
  it("rejects a blank/whitespace-only string when required", () => {
    expect(validString("", { required: true })).toBe(false);
    expect(validString("   ", { required: true })).toBe(false);
  });
  it("allows a blank string when not required", () => {
    expect(validString("")).toBe(true);
  });
  it("accepts a normal non-empty string", () => {
    expect(validString("Riverside FC", { required: true, maxLength: 200 })).toBe(true);
  });
});

describe("validInt", () => {
  it("allows undefined/null when not required", () => {
    expect(validInt(undefined)).toBe(true);
    expect(validInt(null)).toBe(true);
  });
  it("rejects undefined/null when required", () => {
    expect(validInt(undefined, { required: true })).toBe(false);
  });
  it("rejects non-integers", () => {
    expect(validInt(1.5)).toBe(false);
    expect(validInt("3")).toBe(false);
    expect(validInt(NaN)).toBe(false);
    expect(validInt(Infinity)).toBe(false);
  });
  it("enforces min/max bounds inclusively", () => {
    expect(validInt(0, { min: 0, max: 500 })).toBe(true);
    expect(validInt(500, { min: 0, max: 500 })).toBe(true);
    expect(validInt(-1, { min: 0, max: 500 })).toBe(false);
    expect(validInt(501, { min: 0, max: 500 })).toBe(false);
  });
});

describe("validBoolean", () => {
  it("allows undefined/null when not required, rejects when required", () => {
    expect(validBoolean(undefined)).toBe(true);
    expect(validBoolean(undefined, { required: true })).toBe(false);
  });
  it("only accepts actual booleans", () => {
    expect(validBoolean(true)).toBe(true);
    expect(validBoolean(false)).toBe(true);
    expect(validBoolean("true")).toBe(false);
    expect(validBoolean(1)).toBe(false);
  });
});

describe("validDateString", () => {
  it("allows undefined/null when not required, rejects when required", () => {
    expect(validDateString(undefined)).toBe(true);
    expect(validDateString(undefined, { required: true })).toBe(false);
  });
  it("requires YYYY-MM-DD shape", () => {
    expect(validDateString("2026-07-14")).toBe(true);
    expect(validDateString("07/14/2026")).toBe(false);
    expect(validDateString("2026-7-14")).toBe(false);
  });
  it("rejects a syntactically-shaped but invalid calendar date", () => {
    expect(validDateString("2026-13-40")).toBe(false);
  });
});

describe("validStatCount", () => {
  it("is a non-negative integer capped at 500", () => {
    expect(validStatCount(0)).toBe(true);
    expect(validStatCount(500)).toBe(true);
    expect(validStatCount(501)).toBe(false);
    expect(validStatCount(-1)).toBe(false);
  });
});

describe("badRequest", () => {
  it("sets a 400 status with the given error and returns false", () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const result = badRequest(res, "name is required");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "name is required" });
    expect(result).toBe(false);
  });
});
