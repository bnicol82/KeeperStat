// Shared GK Impact Score engine — imported by both the frontend (src/App.jsx)
// and backend (api/rankings.js) so the score shown on a keeper's own
// Dashboard/Progress screens is always identical to what the KeeperStat
// Rankings leaderboard computes for the same matches.

export const LEVELS = {
  youth: { label: "Youth (U8–U14)", short: "Youth", baseline: 0.65 },
  highschool: { label: "High School", short: "High School", baseline: 0.72 },
  adult: { label: "Adult / Club", short: "Adult", baseline: 0.76 },
  semipro: { label: "Semi-Pro", short: "Semi-Pro", baseline: 0.80 },
};

// Goals Prevented: how many goals the keeper saved relative to what a
// baseline keeper at this level of play would be expected to concede,
// given the same shot volume. This is the core of the GK Impact Score —
// unlike raw save %, it isn't warped by a light or heavy shot count, and
// it rewards workload rather than punishing a keeper for facing more shots.
export const goalsPrevented = (shotsFaced, goalsAgainst, baseline) => {
  if (shotsFaced <= 0) return 0;
  const expectedGoalsAgainst = shotsFaced * (1 - baseline);
  return expectedGoalsAgainst - goalsAgainst;
};

// Attacking-contribution bonus: the keeper's own goals, assists, and
// hockey assists (the pass before the assist) add to the Impact Score —
// a keeper who scores or creates a goal changed the match beyond their
// keeping. Capped so a great attacking day can lift a score but never
// fully mask a bad day between the posts.
export const ATTACKING_WEIGHTS = { gkGoal: 8, assist: 5, hockeyAssist: 3, cap: 15 };

export const attackingBonus = ({ gkGoals = 0, assists = 0, hockeyAssists = 0 } = {}) =>
  Math.min(
    ATTACKING_WEIGHTS.cap,
    gkGoals * ATTACKING_WEIGHTS.gkGoal + assists * ATTACKING_WEIGHTS.assist + hockeyAssists * ATTACKING_WEIGHTS.hockeyAssist
  );

// Converts Goals Prevented into the 0–100 GK Impact Score shown throughout
// the app: 50 is "performed exactly at the level-of-play baseline." The
// optional attacking object (gkGoals/assists/hockeyAssists) is additive and
// defaults to zero, so callers without attacking data get the same score
// as before those stats existed.
export const impactScoreFromStats = (shotsFaced, saves, goalsAgainst, baseline, attacking) => {
  const gp = goalsPrevented(shotsFaced, goalsAgainst, baseline);
  let s = 50 + gp * 10;
  if (goalsAgainst === 0 && shotsFaced > 0) s += 5; // clean sheet bonus
  s += Math.min(shotsFaced * 0.5, 6); // small reward for workload/volume
  s += attackingBonus(attacking);
  return Math.round(Math.min(99, Math.max(5, s)));
};

// GDE — Goalkeeper Defensive Efficiency: saves / shots faced (0–1). Returns
// null when no shots were faced rather than 0, which would misrepresent a
// shutout with zero work as a poor defensive performance.
export const gde = (saves, shotsFaced) => (shotsFaced > 0 ? saves / shotsFaced : null);

// TOE — Team Offensive Efficiency: goals scored / team shots on goal (0–1).
// Returns null when team shot data isn't available for this match rather
// than silently reporting 0, which would misrepresent the attack as wasteful.
export const toe = (goalsScored, teamShotsOnGoal) => (teamShotsOnGoal ? goalsScored / teamShotsOnGoal : null);

// GMIS — Goalkeeper Match Impact Score: GDE − TOE. Positive = keeper
// outperformed the attack this match; negative = the attack carried more of
// the game than the keeper did. This is match *context*, not a grade — it
// depends on teammates' finishing, which the keeper doesn't control. Null
// whenever either side of the comparison isn't available for this match.
export const gmis = (gdeVal, toeVal) => (gdeVal === null || toeVal === null ? null : gdeVal - toeVal);
