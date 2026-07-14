import { describe, it, expect } from "vitest";
import { parseScheduleText } from "./scheduleImport.js";

describe("parseScheduleText", () => {
  it("parses comma-separated opponent + ISO date", () => {
    expect(parseScheduleText("Harbor FC, 2026-08-01")).toEqual([
      { opponent: "Harbor FC", date: "2026-08-01" },
    ]);
  });

  it("parses tab-separated rows (pasted spreadsheet columns)", () => {
    expect(parseScheduleText("Harbor FC\t2026-08-01")).toEqual([
      { opponent: "Harbor FC", date: "2026-08-01" },
    ]);
  });

  it("treats a non-ISO date format as no date, rather than silently misreading it", () => {
    // Regression: the old implementation used `new Date(s).toISOString()`,
    // which parses a slash-formatted date like this as *local* midnight —
    // for any user in a timezone ahead of UTC, that silently shifted the
    // fixture a day backward (verified: 8/1/2026 -> 2026-07-31 in Tokyo/NZ
    // time) instead of just rejecting the unsupported format.
    expect(parseScheduleText("Harbor FC, 8/1/2026")).toEqual([
      { opponent: "Harbor FC", date: null },
    ]);
  });

  it("rejects a syntactically-shaped but invalid calendar date", () => {
    expect(parseScheduleText("Harbor FC, 2026-02-30")).toEqual([
      { opponent: "Harbor FC", date: null },
    ]);
  });

  it("allows a missing date column", () => {
    expect(parseScheduleText("Harbor FC")).toEqual([{ opponent: "Harbor FC", date: null }]);
  });

  it("skips a leading header row", () => {
    expect(parseScheduleText("Opponent, Date\nHarbor FC, 2026-08-01")).toEqual([
      { opponent: "Harbor FC", date: "2026-08-01" },
    ]);
  });

  it("skips blank lines", () => {
    expect(parseScheduleText("Harbor FC, 2026-08-01\n\n\nWestfield Rovers, 2026-08-08")).toEqual([
      { opponent: "Harbor FC", date: "2026-08-01" },
      { opponent: "Westfield Rovers", date: "2026-08-08" },
    ]);
  });

  it("skips rows with no opponent", () => {
    expect(parseScheduleText(", 2026-08-01\nHarbor FC, 2026-08-08")).toEqual([
      { opponent: "Harbor FC", date: "2026-08-08" },
    ]);
  });
});
