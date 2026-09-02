import { describe, it, expect } from "vitest";
import { emptyMatch, applyMatchAction } from "./matchActions.js";

const apply = (types, start = emptyMatch("Test FC")) =>
  types.reduce((m, type) => applyMatchAction(m, { type }), start);

describe("saves vs shots on goal", () => {
  // The regression, in the tester's words: "if I hit shot on goal it's +1
  // shot on goal, but if I hit save it's +1 save AND +1 shot on goal."
  it("a save adds a save and no shot on goal", () => {
    const m = apply(["save"]);
    expect(m.saves).toBe(1);
    expect(m.shotsFaced).toBe(0);
  });

  it("tapping shot on target then save counts ONE shot on goal, not two", () => {
    const m = apply(["shot", "save"]);
    expect(m.shotsFaced).toBe(1);
    expect(m.saves).toBe(1);
  });

  it("lets saves exceed shots on goal, for crosses claimed off the face of goal", () => {
    const m = apply(["save", "save", "save", "shot"]);
    expect(m.saves).toBe(3);
    expect(m.shotsFaced).toBe(1);
  });

  it("big saves and penalty saves also add a save without a shot on goal", () => {
    const big = apply(["bigSave"]);
    expect([big.bigSaves, big.saves, big.shotsFaced]).toEqual([1, 1, 0]);
    const pen = apply(["penaltySave"]);
    expect([pen.penaltySaves, pen.saves, pen.shotsFaced]).toEqual([1, 1, 0]);
  });

  it("a goal against still counts a shot on goal, since a goal is always on target", () => {
    const m = apply(["goal"]);
    expect(m.goalsAgainst).toBe(1);
    expect(m.shotsFaced).toBe(1);
  });

  it("a shot on target faced adds only a shot on goal", () => {
    const m = apply(["shot"]);
    expect(m.shotsFaced).toBe(1);
    expect(m.saves).toBe(0);
    expect(m.goalsAgainst).toBe(0);
  });
});

describe("undo", () => {
  const ACTIONS = [
    "save", "goal", "goalFor", "gkGoal", "assist", "hockeyAssist", "sweep",
    "teamShotOnGoal", "shot", "distributionComplete", "distributionMiss",
    "claim", "punch", "penaltySave", "bigSave",
  ];

  // Table-driven so every action — including the ones added for attacking
  // stats and sweeps — is covered, and a new action that forgets its undo
  // branch fails here instead of silently corrupting a match.
  it.each(ACTIONS)("undoing %s restores the exact prior state", (type) => {
    const before = apply(["shot", "save", "goal"]);
    const after = applyMatchAction(applyMatchAction(before, { type }), { type: "undo" });
    expect(after).toEqual(before);
  });

  it("is a no-op on an empty log", () => {
    const empty = emptyMatch("Test FC");
    expect(applyMatchAction(empty, { type: "undo" })).toEqual(empty);
  });

  it("drops an unknown log entry without touching any counter", () => {
    const m = { ...emptyMatch("Test FC"), shotsFaced: 4, saves: 3, log: [{ t: "mystery", label: "?" }] };
    const undone = applyMatchAction(m, { type: "undo" });
    expect(undone.shotsFaced).toBe(4);
    expect(undone.saves).toBe(3);
    expect(undone.log).toEqual([]);
  });
});

describe("other counting rules kept intact", () => {
  it("a keeper goal counts in the team total as well as its own stat", () => {
    const m = apply(["gkGoal"]);
    expect([m.gkGoals, m.ourGoals, m.teamShotsOnGoal]).toEqual([1, 1, 1]);
  });

  it("a sweep counts on its own without a save or a shot on goal", () => {
    const m = apply(["sweep"]);
    expect([m.sweeps, m.saves, m.shotsFaced]).toEqual([1, 0, 0]);
  });

  it("a missed distribution counts an attempt but not a completion", () => {
    const m = apply(["distributionMiss"]);
    expect([m.distributionCompleted, m.distributionAttempted]).toEqual([0, 1]);
  });

  it("flags the last goal against as an error and unflags it again", () => {
    const flagged = applyMatchAction(apply(["goal"]), { type: "toggleError" });
    expect(flagged.errors).toBe(1);
    expect(flagged.log.at(-1).label).toBe("Goal Against (Error)");
    const unflagged = applyMatchAction(flagged, { type: "toggleError" });
    expect(unflagged.errors).toBe(0);
  });

  it("only flags an error when the last action was a goal against", () => {
    const m = apply(["goal", "save"]);
    expect(applyMatchAction(m, { type: "toggleError" })).toEqual(m);
  });
});
