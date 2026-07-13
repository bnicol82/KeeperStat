import { sql, withCors, keeperToJson } from "../_lib/db.js";
import { requireUser } from "../_lib/auth.js";
import { validString, badRequest } from "../_lib/validate.js";
import { enforceRateLimit, RATE_LIMITS } from "../_lib/rateLimit.js";
import { LEVELS } from "../../shared/scoring.js";

const LEVEL_KEYS = Object.keys(LEVELS);

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;

  if (req.method === "GET") {
    const rows = await sql`SELECT * FROM keepers WHERE user_id = ${userId} ORDER BY created_at ASC`;
    res.status(200).json(rows.map(keeperToJson));
    return;
  }

  if (req.method === "POST") {
    if (!(await enforceRateLimit(res, `write:${userId}`, RATE_LIMITS.write))) return;
    const { name, team, level } = req.body ?? {};
    const errors = [];
    if (!validString(name, { required: true, maxLength: 200 })) errors.push("name is required (string, max 200 chars)");
    if (!validString(team, { required: true, maxLength: 200 })) errors.push("team is required (string, max 200 chars)");
    if (level !== undefined && !LEVEL_KEYS.includes(level)) errors.push(`level must be one of: ${LEVEL_KEYS.join(", ")}`);
    if (errors.length) return badRequest(res, errors.join("; "));

    const [row] = await sql`
      INSERT INTO keepers (name, team, level, user_id)
      VALUES (${name}, ${team}, ${level ?? "youth"}, ${userId})
      RETURNING *
    `;
    res.status(201).json(keeperToJson(row));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
