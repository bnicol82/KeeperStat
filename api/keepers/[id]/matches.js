import { sql, withCors, matchToJson, ownsKeeper } from "../../_lib/db.js";
import { requireUser } from "../../_lib/auth.js";

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
    const m = req.body ?? {};
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
