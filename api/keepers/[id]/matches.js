import { sql, withCors, matchToJson, ownsKeeper } from "../../_lib/db.js";
import { requireUser } from "../../_lib/auth.js";
import { validString, validStatCount, badRequest } from "../../_lib/validate.js";
import { enforceRateLimit, RATE_LIMITS } from "../../_lib/rateLimit.js";

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;
  const { id } = req.query;
  if (!(await ownsKeeper(id, userId))) {
    res.status(404).json({ error: "Keeper not found" });
    return;
  }

  if (req.method === "GET") {
    const rows = await sql`
      SELECT * FROM matches WHERE keeper_id = ${id} ORDER BY match_number ASC
    `;
    res.status(200).json(rows.map(matchToJson));
    return;
  }

  if (req.method === "POST") {
    if (!(await enforceRateLimit(res, `write:${userId}`, RATE_LIMITS.write))) return;
    const m = req.body ?? {};
    const errors = [];
    if (m.opp !== undefined && !validString(m.opp, { maxLength: 200 })) errors.push("opp must be a string (max 200 chars)");
    if (!validString(m.res, { required: true, maxLength: 20 })) errors.push("res is required (string, max 20 chars)");
    if (!validStatCount(m.saves)) errors.push("saves must be a non-negative integer (max 500)");
    if (!validStatCount(m.shotsFaced)) errors.push("shotsFaced must be a non-negative integer (max 500)");
    if (!validStatCount(m.ga)) errors.push("ga must be a non-negative integer (max 500)");
    if (!validStatCount(m.goalsScored)) errors.push("goalsScored must be a non-negative integer (max 500)");
    if (!validStatCount(m.teamShotsOnGoal)) errors.push("teamShotsOnGoal must be a non-negative integer (max 500) or omitted");
    if (m.minutesPlayed !== undefined && m.minutesPlayed !== null && !validStatCount(m.minutesPlayed, { max: 200 })) errors.push("minutesPlayed must be a non-negative integer (max 200) or omitted");
    if (!validStatCount(m.distributionCompleted)) errors.push("distributionCompleted must be a non-negative integer (max 500)");
    if (!validStatCount(m.distributionAttempted)) errors.push("distributionAttempted must be a non-negative integer (max 500)");
    if (!validStatCount(m.claims)) errors.push("claims must be a non-negative integer (max 500)");
    if (!validStatCount(m.punches)) errors.push("punches must be a non-negative integer (max 500)");
    if (!validStatCount(m.penaltySaves)) errors.push("penaltySaves must be a non-negative integer (max 500)");
    if (!validStatCount(m.bigSaves)) errors.push("bigSaves must be a non-negative integer (max 500)");
    if (!validStatCount(m.errors)) errors.push("errors must be a non-negative integer (max 500)");
    if (m.notes !== undefined && m.notes !== null && !validString(m.notes, { maxLength: 5000 })) errors.push("notes must be a string (max 5000 chars)");
    if (errors.length) return badRequest(res, errors.join("; "));

    const [{ next_n }] = await sql`
      SELECT COALESCE(MAX(match_number), 0) + 1 AS next_n FROM matches WHERE keeper_id = ${id}
    `;
    const [row] = await sql`
      INSERT INTO matches (
        keeper_id, match_number, opponent, saves, shots_faced, goals_against, result, goals_scored, team_shots_on_goal, minutes_played,
        distribution_completed, distribution_attempted, claims, punches, penalty_saves, big_saves, errors, notes
      )
      VALUES (
        ${id}, ${next_n}, ${m.opp ?? "Unknown Opponent"}, ${m.saves ?? 0}, ${m.shotsFaced ?? 0}, ${m.ga ?? 0}, ${m.res}, ${m.goalsScored ?? 0}, ${m.teamShotsOnGoal ?? null}, ${m.minutesPlayed ?? null},
        ${m.distributionCompleted ?? 0}, ${m.distributionAttempted ?? 0}, ${m.claims ?? 0}, ${m.punches ?? 0}, ${m.penaltySaves ?? 0}, ${m.bigSaves ?? 0}, ${m.errors ?? 0}, ${m.notes ?? null}
      )
      RETURNING *
    `;
    res.status(201).json(matchToJson(row));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
