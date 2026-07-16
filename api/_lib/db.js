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

// Every PR also gets its own Vercel preview deployment at a unique
// keeperstat-<hash-or-branch>-<team>.vercel.app origin that can't be listed
// ahead of time — match this project's preview URLs by prefix rather than
// allowing *.vercel.app generally (which would also allow other projects).
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/keeperstat-[a-z0-9-]+\.vercel\.app$/;

function isAllowedOrigin(origin) {
  return !!origin && (ALLOWED_ORIGINS.has(origin) || VERCEL_PREVIEW_ORIGIN.test(origin));
}

export function withCors(req, res) {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
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
    videoUrl: row.video_url,
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
    // @neondatabase/serverless parses a DATE-only column via `new Date(y, m,
    // d)` — i.e. *local* midnight in whatever timezone this process runs in,
    // not UTC. Reading it back with the matching local getters reproduces
    // the original date exactly, regardless of runtime timezone; .toISOString()
    // instead re-expresses the moment in UTC, silently shifting the date by
    // a day whenever the runtime's timezone isn't UTC (verified: this is
    // currently masked only by Vercel defaulting Node's timezone to UTC).
    date: row.match_date
      ? `${row.match_date.getFullYear()}-${String(row.match_date.getMonth() + 1).padStart(2, "0")}-${String(row.match_date.getDate()).padStart(2, "0")}`
      : null,
  };
}

export function matchVideoToJson(row) {
  return {
    id: row.id,
    videoUrl: row.video_url,
    createdAt: row.created_at,
  };
}

export function interviewResponseToJson(row) {
  return {
    tab: row.tab,
    questionIndex: row.question_index,
    answer: row.answer,
  };
}
