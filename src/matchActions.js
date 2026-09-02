// Live-tracker match state and its pure action reducer, extracted from
// App.jsx so the counting rules have unit tests of their own — the
// save/shot semantics below have been revised repeatedly from real match
// feedback, and they're the easiest thing in the app to break silently.

export const emptyMatch = (opponent = "") => ({
  opponent, ourGoals: 0, goalsAgainst: 0, saves: 0, shotsFaced: 0, clock: "00:00", log: [],
  distributionCompleted: 0, distributionAttempted: 0, claims: 0, punches: 0,
  penaltySaves: 0, bigSaves: 0, errors: 0, notes: "", teamShotsOnGoal: 0,
  gkGoals: 0, assists: 0, hockeyAssists: 0, sweeps: 0,
});

// Pure reducer for live-tracker actions, extracted from dispatch so the
// dispatch wrapper has a single point to stamp new log entries with
// recording metadata (see dispatch in KeeperStat below).
export function applyMatchAction(m, a) {
  // Saves deliberately do NOT imply a shot on goal. A keeper claiming a
  // cross has made a save — it prevented a scoring opportunity — but the
  // ball was travelling across the face of goal, not between the posts, so
  // it was never a shot on target. Tap SHOT ON TARGET FACED separately for
  // the shots. Goals against are the opposite case and still count a shot
  // on goal below, because a goal is always between the posts.
  if (a.type === "save") return { ...m, saves: m.saves + 1, log: [...m.log, { t: "save", label: "Save" }] };
  if (a.type === "goal") return { ...m, goalsAgainst: m.goalsAgainst + 1, shotsFaced: m.shotsFaced + 1, log: [...m.log, { t: "goal", label: "Goal Against" }] };
  if (a.type === "goalFor") return { ...m, ourGoals: m.ourGoals + 1, teamShotsOnGoal: m.teamShotsOnGoal + 1, log: [...m.log, { t: "goalFor", label: "Goal For" }] };
  // The keeper's own goal: tracked separately (gkGoals) but still counted
  // inside the team's total goals and shots on goal.
  if (a.type === "gkGoal") return { ...m, gkGoals: m.gkGoals + 1, ourGoals: m.ourGoals + 1, teamShotsOnGoal: m.teamShotsOnGoal + 1, log: [...m.log, { t: "gkGoal", label: "GK Goal" }] };
  if (a.type === "assist") return { ...m, assists: m.assists + 1, log: [...m.log, { t: "assist", label: "Assist" }] };
  if (a.type === "hockeyAssist") return { ...m, hockeyAssists: m.hockeyAssists + 1, log: [...m.log, { t: "hockeyAssist", label: "Hockey Assist" }] };
  if (a.type === "sweep") return { ...m, sweeps: m.sweeps + 1, log: [...m.log, { t: "sweep", label: "Sweep / Smother" }] };
  if (a.type === "teamShotOnGoal") return { ...m, teamShotsOnGoal: m.teamShotsOnGoal + 1, log: [...m.log, { t: "teamShotOnGoal", label: "Team Shot on Goal" }] };
  if (a.type === "shot") return { ...m, shotsFaced: m.shotsFaced + 1, log: [...m.log, { t: "shot", label: "Shot on Target Faced" }] };
  if (a.type === "distributionComplete") return { ...m, distributionCompleted: m.distributionCompleted + 1, distributionAttempted: m.distributionAttempted + 1, log: [...m.log, { t: "distributionComplete", label: "Distribution Completed" }] };
  if (a.type === "distributionMiss") return { ...m, distributionAttempted: m.distributionAttempted + 1, log: [...m.log, { t: "distributionMiss", label: "Distribution Missed" }] };
  if (a.type === "claim") return { ...m, claims: m.claims + 1, log: [...m.log, { t: "claim", label: "Claim" }] };
  if (a.type === "punch") return { ...m, punches: m.punches + 1, log: [...m.log, { t: "punch", label: "Punch" }] };
  if (a.type === "penaltySave") return { ...m, penaltySaves: m.penaltySaves + 1, saves: m.saves + 1, log: [...m.log, { t: "penaltySave", label: "Penalty Save" }] };
  if (a.type === "bigSave") return { ...m, bigSaves: m.bigSaves + 1, saves: m.saves + 1, log: [...m.log, { t: "bigSave", label: "Big Save" }] };
  if (a.type === "toggleError") {
    if (!m.log.length) return m;
    const lastIdx = m.log.length - 1;
    const last = m.log[lastIdx];
    if (last.t !== "goal") return m;
    const flagged = !last.isError;
    const log = [...m.log];
    log[lastIdx] = { ...last, isError: flagged, label: flagged ? "Goal Against (Error)" : "Goal Against" };
    return { ...m, errors: m.errors + (flagged ? 1 : -1), log };
  }
  if (a.type === "undo" && m.log.length) {
    const last = m.log[m.log.length - 1];
    const log = m.log.slice(0, -1);
    if (last.t === "save") return { ...m, saves: m.saves - 1, log };
    if (last.t === "goal") return { ...m, goalsAgainst: m.goalsAgainst - 1, shotsFaced: m.shotsFaced - 1, errors: last.isError ? m.errors - 1 : m.errors, log };
    if (last.t === "goalFor") return { ...m, ourGoals: m.ourGoals - 1, teamShotsOnGoal: m.teamShotsOnGoal - 1, log };
    if (last.t === "gkGoal") return { ...m, gkGoals: m.gkGoals - 1, ourGoals: m.ourGoals - 1, teamShotsOnGoal: m.teamShotsOnGoal - 1, log };
    if (last.t === "assist") return { ...m, assists: m.assists - 1, log };
    if (last.t === "hockeyAssist") return { ...m, hockeyAssists: m.hockeyAssists - 1, log };
    if (last.t === "sweep") return { ...m, sweeps: m.sweeps - 1, log };
    if (last.t === "teamShotOnGoal") return { ...m, teamShotsOnGoal: m.teamShotsOnGoal - 1, log };
    if (last.t === "distributionComplete") return { ...m, distributionCompleted: m.distributionCompleted - 1, distributionAttempted: m.distributionAttempted - 1, log };
    if (last.t === "distributionMiss") return { ...m, distributionAttempted: m.distributionAttempted - 1, log };
    if (last.t === "claim") return { ...m, claims: m.claims - 1, log };
    if (last.t === "punch") return { ...m, punches: m.punches - 1, log };
    if (last.t === "penaltySave") return { ...m, penaltySaves: m.penaltySaves - 1, saves: m.saves - 1, log };
    if (last.t === "bigSave") return { ...m, bigSaves: m.bigSaves - 1, saves: m.saves - 1, log };
    if (last.t === "shot") return { ...m, shotsFaced: m.shotsFaced - 1, log };
    // Unknown entry: drop it from the log but touch no counter, rather than
    // guessing at which one it belonged to.
    return { ...m, log };
  }
  return m;
}
