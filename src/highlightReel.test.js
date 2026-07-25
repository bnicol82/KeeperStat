import { describe, it, expect } from "vitest";
import { extractHighlightWindows, sliceSegmentFrames } from "./highlightReel.js";

describe("sliceSegmentFrames", () => {
  const sampleRate = 10; // 10 samples per second keeps the math readable
  const channel = Float32Array.from({ length: 100 }, (_, i) => i); // 10 seconds

  it("cuts the requested window out of the channel data", () => {
    const out = sliceSegmentFrames(channel, sampleRate, 2, 4); // 2s..4s
    expect(out.length).toBe(20);
    expect(out[0]).toBe(20);
    expect(out[19]).toBe(39);
  });

  it("clamps a window extending past the end of the clip", () => {
    const out = sliceSegmentFrames(channel, sampleRate, 8, 15);
    expect(out.length).toBe(20); // 8s..10s only
    expect(out[0]).toBe(80);
  });

  it("clamps a negative start to the beginning", () => {
    const out = sliceSegmentFrames(channel, sampleRate, -3, 1);
    expect(out.length).toBe(10);
    expect(out[0]).toBe(0);
  });

  it("returns an empty slice for a window entirely past the clip", () => {
    expect(sliceSegmentFrames(channel, sampleRate, 20, 25).length).toBe(0);
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
