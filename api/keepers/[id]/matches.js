import { sql, withCors, matchToJson } from "../../_lib/db.js";

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const { id } = req.query;

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
      INSERT INTO matches (keeper_id, match_number, opponent, saves, shots_faced, goals_against, result, goals_scored, team_shots_on_goal, minutes_played)
      VALUES (${id}, ${next_n}, ${m.opp ?? "Unknown Opponent"}, ${m.saves ?? 0}, ${m.shotsFaced ?? 0}, ${m.ga ?? 0}, ${m.res}, ${m.goalsScored ?? 0}, ${m.teamShotsOnGoal ?? null}, ${m.minutesPlayed ?? null})
      RETURNING *
    `;
    res.status(201).json(matchToJson(row));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
