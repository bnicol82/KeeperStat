import { describe, it, expect } from "vitest";
import { selectPending, selectPrunable } from "./clipStore.js";

const clip = (over = {}) => ({
  id: 1, sessionId: "s1", index: 0, blob: {}, mimeType: "video/webm",
  recordedAt: Date.now(), matchId: null, uploaded: false, ...over,
});

describe("selectPending", () => {
  it("returns clips that belong to a saved match and haven't uploaded", () => {
    const rows = [clip({ id: 1, matchId: "m1" }), clip({ id: 2, matchId: "m1", uploaded: true })];
    expect(selectPending(rows).map((c) => c.id)).toEqual([1]);
  });

  // A clip with no matchId comes from a match that was never saved — there's
  // nothing on the server to attach it to, so it must not be retried.
  it("skips clips from a match that was never saved", () => {
    expect(selectPending([clip({ id: 3, matchId: null })])).toEqual([]);
  });

  it("orders by the index they were recorded in", () => {
    const rows = [clip({ id: 1, index: 2, matchId: "m" }), clip({ id: 2, index: 0, matchId: "m" }), clip({ id: 3, index: 1, matchId: "m" })];
    expect(selectPending(rows).map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it("is empty for an empty store", () => {
    expect(selectPending([])).toEqual([]);
  });
});

describe("selectPrunable", () => {
  const NOW = 1_700_000_000_000;
  const days = (n) => n * 24 * 60 * 60 * 1000;

  it("drops uploaded clips, whose blobs the server already has", () => {
    expect(selectPrunable([clip({ id: 1, uploaded: true, matchId: "m" })], NOW).map((c) => c.id)).toEqual([1]);
  });

  it("drops orphans from matches never saved once they age out", () => {
    const old = clip({ id: 2, matchId: null, recordedAt: NOW - days(8) });
    expect(selectPrunable([old], NOW).map((c) => c.id)).toEqual([2]);
  });

  it("keeps a recent orphan, since that match may still be in progress", () => {
    const recent = clip({ id: 3, matchId: null, recordedAt: NOW - days(1) });
    expect(selectPrunable([recent], NOW)).toEqual([]);
  });

  // The whole point of the store: a pending upload must never be pruned,
  // however old, or the footage is gone for good.
  it("never drops a pending clip that belongs to a saved match", () => {
    const stale = clip({ id: 4, matchId: "m", uploaded: false, recordedAt: NOW - days(90) });
    expect(selectPrunable([stale], NOW)).toEqual([]);
  });

  it("respects a custom age cutoff", () => {
    const orphan = clip({ id: 5, matchId: null, recordedAt: NOW - days(3) });
    expect(selectPrunable([orphan], NOW, 7)).toEqual([]);
    expect(selectPrunable([orphan], NOW, 2).map((c) => c.id)).toEqual([5]);
  });
});
