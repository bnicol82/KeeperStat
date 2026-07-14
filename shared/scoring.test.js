import { describe, it, expect } from "vitest";
import { LEVELS, goalsPrevented, impactScoreFromStats, gde, toe, gmis } from "./scoring.js";

describe("LEVELS", () => {
  it("has a baseline between 0 and 1 for every level", () => {
    for (const key of Object.keys(LEVELS)) {
      expect(LEVELS[key].baseline).toBeGreaterThan(0);
      expect(LEVELS[key].baseline).toBeLessThan(1);
    }
  });
});

describe("goalsPrevented", () => {
  it("returns 0 when no shots were faced", () => {
    expect(goalsPrevented(0, 0, 0.65)).toBe(0);
  });

  it("is positive when the keeper conceded fewer goals than the baseline expects", () => {
    // 10 shots faced at a 0.65 baseline expects 3.5 goals against; conceding 1 beats that.
    expect(goalsPrevented(10, 1, 0.65)).toBeCloseTo(2.5);
  });

  it("is negative when the keeper conceded more goals than the baseline expects", () => {
    expect(goalsPrevented(10, 8, 0.65)).toBeCloseTo(-4.5);
  });

  it("is exactly 0 when performance matches the baseline precisely", () => {
    // 20 shots at 0.65 baseline expects exactly 7 goals against.
    expect(goalsPrevented(20, 7, 0.65)).toBeCloseTo(0);
  });
});

describe("impactScoreFromStats", () => {
  it("stays within the documented 5-99 bounds across a wide input range", () => {
    for (let shotsFaced = 0; shotsFaced <= 30; shotsFaced += 5) {
      for (let goalsAgainst = 0; goalsAgainst <= shotsFaced; goalsAgainst += 3) {
        const score = impactScoreFromStats(shotsFaced, shotsFaced - goalsAgainst, goalsAgainst, 0.65);
        expect(score).toBeGreaterThanOrEqual(5);
        expect(score).toBeLessThanOrEqual(99);
      }
    }
  });

  it("scores a clean sheet higher than an identical match that conceded", () => {
    const cleanSheet = impactScoreFromStats(10, 10, 0, 0.65);
    const conceded = impactScoreFromStats(10, 9, 1, 0.65);
    expect(cleanSheet).toBeGreaterThan(conceded);
  });

  it("rewards a busier match (more shots faced, same save rate) over a quiet one", () => {
    const busy = impactScoreFromStats(14, 12.6, 1.4, 0.65); // same 90% save rate as below, more shots
    const quiet = impactScoreFromStats(5, 4.5, 0.5, 0.65);
    expect(busy).toBeGreaterThan(quiet);
  });

  it("never returns a non-finite or fractional score", () => {
    const score = impactScoreFromStats(7, 5, 2, 0.72);
    expect(Number.isInteger(score)).toBe(true);
    expect(Number.isFinite(score)).toBe(true);
  });

  it("handles a 0-shots-faced match without dividing by zero", () => {
    expect(() => impactScoreFromStats(0, 0, 0, 0.65)).not.toThrow();
    expect(Number.isFinite(impactScoreFromStats(0, 0, 0, 0.65))).toBe(true);
  });
});

describe("gde", () => {
  it("is the save rate when shots were faced", () => {
    expect(gde(8, 10)).toBeCloseTo(0.8);
  });

  it("returns null (not 0) when no shots were faced, so a shutout isn't misread as a poor defensive game", () => {
    expect(gde(0, 0)).toBeNull();
  });
});

describe("toe", () => {
  it("is the conversion rate when team shots on goal is tracked", () => {
    expect(toe(2, 8)).toBeCloseTo(0.25);
  });

  it("returns null (not 0) when team shots on goal isn't tracked, so the attack isn't misread as wasteful", () => {
    expect(toe(2, 0)).toBeNull();
    expect(toe(0, null)).toBeNull();
  });
});

describe("gmis", () => {
  it("is the difference between GDE and TOE", () => {
    expect(gmis(0.8, 0.25)).toBeCloseTo(0.55);
  });

  it("is null when GDE is unavailable (0 shots faced)", () => {
    expect(gmis(null, 0.25)).toBeNull();
  });

  it("is null when TOE is unavailable (team shots not tracked)", () => {
    expect(gmis(0.8, null)).toBeNull();
  });

  it("is null when both sides are unavailable", () => {
    expect(gmis(null, null)).toBeNull();
  });
});
