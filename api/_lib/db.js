import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

// GitHub Pages is the canonical frontend; the Vercel deployment also
// happens to serve a working copy of it (same build, different base path)
// since Vercel builds the whole project — allow it too so that copy isn't
// silently broken for anyone using it.
const ALLOWED_ORIGINS = new Set([
  "https://bnicol82.github.io",
  "https://keeperstat.vercel.app",
  "http://localhost:5173",
]);

export function withCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export function keeperToJson(row) {
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    level: row.level,
    photoUrl: row.photo_url,
    rankingsUrl: row.rankings_url,
    isPublic: row.is_public,
    focusArea: row.focus_area_title ? { title: row.focus_area_title, note: row.focus_area_note } : null,
    nextGoal: row.next_goal,
    showGMIS: row.show_gmis,
    notifPrefs: { matchReminders: row.match_reminders, weeklySummary: row.weekly_summary },
  };
}

export function matchToJson(row) {
  return {
    id: row.id,
    n: row.match_number,
    opp: row.opponent,
    saves: row.saves,
    shotsFaced: row.shots_faced,
    ga: row.goals_against,
    res: row.result,
    goalsScored: row.goals_scored,
    teamShotsOnGoal: row.team_shots_on_goal,
    minutesPlayed: row.minutes_played,
    distributionCompleted: row.distribution_completed,
    distributionAttempted: row.distribution_attempted,
    claims: row.claims,
    punches: row.punches,
    penaltySaves: row.penalty_saves,
    bigSaves: row.big_saves,
    errors: row.errors,
    notes: row.notes,
  };
}

// Confirms the keeper exists and belongs to userId — used by every
// keeper-scoped sub-resource (matches, fixtures) before touching data.
export async function ownsKeeper(id, userId) {
  const [row] = await sql`SELECT id FROM keepers WHERE id = ${id} AND user_id = ${userId}`;
  return !!row;
}

export function fixtureToJson(row) {
  return {
    id: row.id,
    opponent: row.opponent,
    // neon-serverless returns DATE columns as JS Date objects; format as YYYY-MM-DD
    date: row.match_date ? row.match_date.toISOString().slice(0, 10) : null,
  };
}

export function interviewResponseToJson(row) {
  return {
    tab: row.tab,
    questionIndex: row.question_index,
    answer: row.answer,
  };
}
