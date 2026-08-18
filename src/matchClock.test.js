import { describe, it, expect } from "vitest";
import { startAnchor, elapsedMs, pauseAnchor, resumeAnchor, formatClock, anchorFromClock } from "./matchClock.js";

describe("formatClock", () => {
  it("zero-pads minutes and seconds", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(9 * 1000)).toBe("00:09");
    expect(formatClock(61 * 1000)).toBe("01:01");
    expect(formatClock(3600 * 1000)).toBe("60:00");
  });

  it("counts past 99 minutes without wrapping", () => {
    expect(formatClock(100 * 60 * 1000)).toBe("100:00");
  });

  it("never shows negative time", () => {
    expect(formatClock(-5000)).toBe("00:00");
  });
});

describe("elapsedMs", () => {
  // The regression that made an hour read 43:00: the old clock counted
  // setInterval ticks, so every tick iOS dropped while backgrounded was time
  // lost for good. Deriving from wall time makes dropped ticks irrelevant.
  it("reports the full hour even when no ticks happened in between", () => {
    const anchor = startAnchor(0);
    expect(formatClock(elapsedMs(anchor, 3600 * 1000))).toBe("60:00");
  });

  it("resyncs after a long suspended stretch instead of drifting behind", () => {
    const anchor = startAnchor(0);
    // Simulates the screen locking at 5:00 and waking 20 real minutes later.
    expect(formatClock(elapsedMs(anchor, 5 * 60 * 1000))).toBe("05:00");
    expect(formatClock(elapsedMs(anchor, 25 * 60 * 1000))).toBe("25:00");
  });

  it("is zero for a missing anchor", () => {
    expect(elapsedMs(null, 1000)).toBe(0);
  });

  it("never goes backwards if the clock source jumps backwards", () => {
    const anchor = startAnchor(10_000);
    expect(elapsedMs(anchor, 5_000)).toBe(0);
  });
});

describe("pause and resume", () => {
  it("freezes the elapsed time while paused", () => {
    const paused = pauseAnchor(startAnchor(0), 90 * 1000);
    expect(formatClock(elapsedMs(paused, 90 * 1000))).toBe("01:30");
    // Ten more minutes of real time pass, but the clock is paused.
    expect(formatClock(elapsedMs(paused, 690 * 1000))).toBe("01:30");
  });

  it("continues from the frozen value on resume", () => {
    const paused = pauseAnchor(startAnchor(0), 90 * 1000);
    const resumed = resumeAnchor(paused, 690 * 1000);
    expect(formatClock(elapsedMs(resumed, 690 * 1000))).toBe("01:30");
    expect(formatClock(elapsedMs(resumed, 750 * 1000))).toBe("02:30");
  });

  it("ignores a repeated pause rather than banking the stretch twice", () => {
    const once = pauseAnchor(startAnchor(0), 60 * 1000);
    const twice = pauseAnchor(once, 600 * 1000);
    expect(elapsedMs(twice, 600 * 1000)).toBe(60 * 1000);
  });

  it("ignores a repeated resume rather than restarting the stretch", () => {
    const running = startAnchor(0);
    const resumed = resumeAnchor(running, 60 * 1000);
    expect(elapsedMs(resumed, 120 * 1000)).toBe(120 * 1000);
  });
});

describe("anchorFromClock", () => {
  it("round-trips a displayed clock into a paused anchor", () => {
    const anchor = anchorFromClock("43:07");
    expect(anchor.startedAt).toBeNull();
    expect(formatClock(elapsedMs(anchor, 999_999))).toBe("43:07");
  });

  it("resumes counting from the restored value", () => {
    const resumed = resumeAnchor(anchorFromClock("43:07"), 1000);
    expect(formatClock(elapsedMs(resumed, 61 * 1000))).toBe("44:07");
  });

  it("falls back to zero for missing or malformed input", () => {
    expect(elapsedMs(anchorFromClock(""), 0)).toBe(0);
    expect(elapsedMs(anchorFromClock(undefined), 0)).toBe(0);
    expect(elapsedMs(anchorFromClock("garbage"), 0)).toBe(0);
  });
});
