import { sql, withCors, matchToJson } from "../../../_lib/db.js";

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const { id, matchId } = req.query;

  if (req.method === "PATCH") {
    const [existing] = await sql`SELECT * FROM matches WHERE id = ${matchId} AND keeper_id = ${id}`;
    if (!existing) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const p = req.body ?? {};
    const next = {
      opponent: p.opp ?? existing.opponent,
      saves: p.saves ?? existing.saves,
      shots_faced: p.shotsFaced ?? existing.shots_faced,
      goals_against: p.ga ?? existing.goals_against,
      result: p.res ?? existing.result,
      goals_scored: p.goalsScored ?? existing.goals_scored,
      team_shots_on_goal: p.teamShotsOnGoal !== undefined ? p.teamShotsOnGoal : existing.team_shots_on_goal,
      minutes_played: p.minutesPlayed !== undefined ? p.minutesPlayed : existing.minutes_played,
    };

    const [row] = await sql`
      UPDATE matches SET
        opponent = ${next.opponent},
        saves = ${next.saves},
        shots_faced = ${next.shots_faced},
        goals_against = ${next.goals_against},
        result = ${next.result},
        goals_scored = ${next.goals_scored},
        team_shots_on_goal = ${next.team_shots_on_goal},
        minutes_played = ${next.minutes_played}
      WHERE id = ${matchId}
      RETURNING *
    `;
    res.status(200).json(matchToJson(row));
    return;
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM matches WHERE id = ${matchId} AND keeper_id = ${id}`;
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
