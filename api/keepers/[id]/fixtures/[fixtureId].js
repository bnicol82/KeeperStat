import { sql, withCors, ownsKeeper } from "../../../_lib/db.js";
import { requireUser } from "../../../_lib/auth.js";
import { enforceRateLimit, RATE_LIMITS } from "../../../_lib/rateLimit.js";

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;
  const { id, fixtureId } = req.query;
  if (!(await ownsKeeper(id, userId))) {
    res.status(404).json({ error: "Keeper not found" });
    return;
  }

  if (req.method === "DELETE") {
    if (!(await enforceRateLimit(res, `write:${userId}`, RATE_LIMITS.write))) return;
    await sql`DELETE FROM fixtures WHERE id = ${fixtureId} AND keeper_id = ${id}`;
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
