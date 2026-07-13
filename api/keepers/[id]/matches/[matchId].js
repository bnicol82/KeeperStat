import { sql, withCors, matchToJson, ownsKeeper } from "../../../_lib/db.js";
import { requireUser } from "../../../_lib/auth.js";
import { validString, validStatCount, badRequest } from "../../../_lib/validate.js";

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;
  const { id, matchId } = req.query;
  if (!(await ownsKeeper(id, userId))) {
    res.status(404).json({ error: "Keeper not found" });
    return;
  }

  if (req.method === "PATCH") {
    const p = req.body ?? {};
    const errors = [];
    if (p.opp !== undefined && !validString(p.opp, { required: true, maxLength: 200 })) errors.push("opp must be a non-empty string (max 200 chars)");
    if (p.res !== undefined && !validString(p.res, { required: true, maxLength: 20 })) errors.push("res must be a non-empty string (max 20 chars)");
    if (p.saves !== undefined && !validStatCount(p.saves)) errors.push("saves must be a non-negative integer (max 500)");
    if (p.shotsFaced !== undefined && !validStatCount(p.shotsFaced)) errors.push("shotsFaced must be a non-negative integer (max 500)");
    if (p.ga !== undefined && !validStatCount(p.ga)) errors.push("ga must be a non-negative integer (max 500)");
    if (p.goalsScored !== undefined && !validStatCount(p.goalsScored)) errors.push("goalsScored must be a non-negative integer (max 500)");
    if (p.teamShotsOnGoal !== undefined && p.teamShotsOnGoal !== null && !validStatCount(p.teamShotsOnGoal)) errors.push("teamShotsOnGoal must be a non-negative integer (max 500) or null");
    if (p.minutesPlayed !== undefined && p.minutesPlayed !== null && !validStatCount(p.minutesPlayed, { max: 200 })) errors.push("minutesPlayed must be a non-negative integer (max 200) or null");
    if (p.distributionCompleted !== undefined && !validStatCount(p.distributionCompleted)) errors.push("distributionCompleted must be a non-negative integer (max 500)");
    if (p.distributionAttempted !== undefined && !validStatCount(p.distributionAttempted)) errors.push("distributionAttempted must be a non-negative integer (max 500)");
    if (p.claims !== undefined && !validStatCount(p.claims)) errors.push("claims must be a non-negative integer (max 500)");
    if (p.punches !== undefined && !validStatCount(p.punches)) errors.push("punches must be a non-negative integer (max 500)");
    if (p.penaltySaves !== undefined && !validStatCount(p.penaltySaves)) errors.push("penaltySaves must be a non-negative integer (max 500)");
    if (p.bigSaves !== undefined && !validStatCount(p.bigSaves)) errors.push("bigSaves must be a non-negative integer (max 500)");
    if (p.errors !== undefined && !validStatCount(p.errors)) errors.push("errors must be a non-negative integer (max 500)");
    if (p.notes !== undefined && p.notes !== null && !validString(p.notes, { maxLength: 5000 })) errors.push("notes must be a string (max 5000 chars)");
    if (errors.length) return badRequest(res, errors.join("; "));

    const [existing] = await sql`SELECT * FROM matches WHERE id = ${matchId} AND keeper_id = ${id}`;
    if (!existing) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const next = {
      opponent: p.opp ?? existing.opponent,
      saves: p.saves ?? existing.saves,
      shots_faced: p.shotsFaced ?? existing.shots_faced,
      goals_against: p.ga ?? existing.goals_against,
      result: p.res ?? existing.result,
      goals_scored: p.goalsScored ?? existing.goals_scored,
      team_shots_on_goal: p.teamShotsOnGoal !== undefined ? p.teamShotsOnGoal : existing.team_shots_on_goal,
      minutes_played: p.minutesPlayed !== undefined ? p.minutesPlayed : existing.minutes_played,
      distribution_completed: p.distributionCompleted ?? existing.distribution_completed,
      distribution_attempted: p.distributionAttempted ?? existing.distribution_attempted,
      claims: p.claims ?? existing.claims,
      punches: p.punches ?? existing.punches,
      penalty_saves: p.penaltySaves ?? existing.penalty_saves,
      big_saves: p.bigSaves ?? existing.big_saves,
      errors: p.errors ?? existing.errors,
      notes: p.notes !== undefined ? p.notes : existing.notes,
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
        minutes_played = ${next.minutes_played},
        distribution_completed = ${next.distribution_completed},
        distribution_attempted = ${next.distribution_attempted},
        claims = ${next.claims},
        punches = ${next.punches},
        penalty_saves = ${next.penalty_saves},
        big_saves = ${next.big_saves},
        errors = ${next.errors},
        notes = ${next.notes}
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
