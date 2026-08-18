// Wall-clock-anchored match timer.
//
// The clock used to be a counter incremented once per setInterval tick. That
// silently loses time on a phone: iOS Safari throttles background timers and
// suspends them outright when the screen locks, so dropped ticks became
// permanently missing minutes (a tester saw 43:00 after a real hour).
//
// Instead we anchor to wall-clock timestamps and *derive* the elapsed time on
// every read, so a suspended tab resyncs the instant it wakes up. An anchor is
// { startedAt, accumulatedMs }: accumulatedMs is time banked by earlier
// running stretches, and startedAt is when the current stretch began (null
// while paused).

export const startAnchor = (now) => ({ startedAt: now, accumulatedMs: 0 });

export const elapsedMs = (anchor, now) => {
  if (!anchor) return 0;
  const running = anchor.startedAt === null ? 0 : Math.max(0, now - anchor.startedAt);
  return anchor.accumulatedMs + running;
};

// Banks the running stretch and stops the clock. Idempotent: pausing an
// already-paused anchor leaves the banked total untouched.
export const pauseAnchor = (anchor, now) =>
  anchor.startedAt === null ? anchor : { startedAt: null, accumulatedMs: elapsedMs(anchor, now) };

// Starts a fresh stretch from whatever was already banked. Idempotent too, so
// a spurious resume can't double-count the stretch already in progress.
export const resumeAnchor = (anchor, now) =>
  anchor.startedAt === null ? { startedAt: now, accumulatedMs: anchor.accumulatedMs } : anchor;

export const formatClock = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

// Rebuilds a paused anchor from a displayed "MM:SS" — used when resuming a
// match that was already ended, where the string is all we kept.
export const anchorFromClock = (clock) => {
  const [mm, ss] = String(clock || "0:0").split(":").map(Number);
  const safe = (n) => (Number.isFinite(n) ? n : 0);
  return { startedAt: null, accumulatedMs: (safe(mm) * 60 + safe(ss)) * 1000 };
};
