import { describe, it, expect } from "vitest";
import { extractHighlightWindows, isWebKitPlayback } from "./highlightReel.js";

describe("isWebKitPlayback", () => {
  it("detects iOS devices regardless of browser (all iOS browsers are WebKit)", () => {
    expect(isWebKitPlayback("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).toBe(true);
    expect(isWebKitPlayback("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1")).toBe(true); // Chrome on iOS
    expect(isWebKitPlayback("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).toBe(true);
  });

  it("detects desktop Safari but not Chromium-family browsers", () => {
    expect(isWebKitPlayback("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")).toBe(true);
    expect(isWebKitPlayback("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")).toBe(false);
    expect(isWebKitPlayback("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0")).toBe(false);
    expect(isWebKitPlayback("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36")).toBe(false);
  });
});

describe("extractHighlightWindows", () => {
  it("builds a window around each big/penalty save, keyed by clip", () => {
    const log = [
      { t: "bigSave", label: "Big Save", clip: 0, at: 30 },
      { t: "penaltySave", label: "Penalty Save", clip: 1, at: 100 },
    ];
    expect(extractHighlightWindows(log)).toEqual({
      0: [[23, 33]],
      1: [[93, 103]],
    });
  });

  it("ignores non-highlight events and events logged while not recording (no clip/at stamp)", () => {
    const log = [
      { t: "save", label: "Save", clip: 0, at: 10 }, // regular save — not a highlight
      { t: "goal", label: "Goal Against", clip: 0, at: 20 },
      { t: "bigSave", label: "Big Save" }, // logged while not filming — no footage exists
    ];
    expect(extractHighlightWindows(log)).toEqual({});
  });

  it("merges overlapping windows within the same clip", () => {
    const log = [
      { t: "bigSave", label: "Big Save", clip: 0, at: 30 }, // [23, 33]
      { t: "penaltySave", label: "Penalty Save", clip: 0, at: 36 }, // [29, 39] — overlaps
      { t: "bigSave", label: "Big Save", clip: 0, at: 90 }, // [83, 93] — separate
    ];
    expect(extractHighlightWindows(log)).toEqual({
      0: [[23, 39], [83, 93]],
    });
  });

  it("clamps window starts to 0 for events right at the start of a clip", () => {
    const log = [{ t: "bigSave", label: "Big Save", clip: 0, at: 2 }];
    expect(extractHighlightWindows(log)).toEqual({ 0: [[0, 5]] });
  });

  it("merges out-of-order events correctly (sorts before merging)", () => {
    const log = [
      { t: "bigSave", label: "Big Save", clip: 0, at: 50 },
      { t: "bigSave", label: "Big Save", clip: 0, at: 45 }, // earlier event logged later
    ];
    expect(extractHighlightWindows(log)).toEqual({ 0: [[38, 53]] });
  });

  it("respects custom before/after padding", () => {
    const log = [{ t: "bigSave", label: "Big Save", clip: 0, at: 60 }];
    expect(extractHighlightWindows(log, { before: 10, after: 5 })).toEqual({ 0: [[50, 65]] });
  });

  it("returns an empty object for an empty or missing log", () => {
    expect(extractHighlightWindows([])).toEqual({});
    expect(extractHighlightWindows(undefined)).toEqual({});
  });
});
