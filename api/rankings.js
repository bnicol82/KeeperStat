import { sql, withCors } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { LEVELS, impactScoreFromStats } from "../shared/scoring.js";

const MIN_MATCHES = 3;

// "Jordan Casey" -> "Jordan C." — public rankings only ever expose a first
// name + last initial, never the full name, since many keeper profiles
// belong to minors.
function toDisplayName(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "Unknown";
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  // Any signed-in KeeperStat user can view the leaderboard — it isn't
  // scoped to keepers the caller owns, unlike every other /api/keepers
  // route, since this is intentionally a cross-account view.
  const userId = await requireUser(req, res);
  if (!userId) return;

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rows = await sql`
    SELECT k.id AS keeper_id, k.name, k.team, k.level,
           m.shots_faced, m.saves, m.goals_against
    FROM keepers k
    JOIN matches m ON m.keeper_id = k.id
    WHERE k.is_public = true
  `;

  const byKeeper = new Map();
  for (const row of rows) {
    if (!byKeeper.has(row.keeper_id)) {
      byKeeper.set(row.keeper_id, { name: row.name, team: row.team, level: row.level, matches: [] });
    }
    byKeeper.get(row.keeper_id).matches.push(row);
  }

  const rankings = [];
  for (const [keeperId, k] of byKeeper) {
    if (k.matches.length < MIN_MATCHES) continue;
    const baseline = LEVELS[k.level]?.baseline ?? LEVELS.youth.baseline;
    const scores = k.matches.map((m) => impactScoreFromStats(m.shots_faced, m.saves, m.goals_against, baseline));
    const avgScore = Math.round(scores.reduce((a, s) => a + s, 0) / scores.length);
    rankings.push({
      id: keeperId,
      displayName: toDisplayName(k.name),
      team: k.team,
      level: k.level,
      avgScore,
      matchesPlayed: k.matches.length,
    });
  }

  rankings.sort((a, b) => b.avgScore - a.avgScore);
  res.status(200).json(rankings);
}
