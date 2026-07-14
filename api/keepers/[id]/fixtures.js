import { sql, withCors, fixtureToJson, ownsKeeper } from "../../_lib/db.js";
import { requireUser } from "../../_lib/auth.js";
import { validString, validDateString } from "../../_lib/validate.js";
import { enforceRateLimit, RATE_LIMITS } from "../../_lib/rateLimit.js";
import { withErrorHandling } from "../../_lib/errors.js";

async function handler(req, res) {
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
      SELECT * FROM fixtures WHERE keeper_id = ${id}
      ORDER BY match_date ASC NULLS LAST, created_at ASC
    `;
    res.status(200).json(rows.map(fixtureToJson));
    return;
  }

  if (req.method === "POST") {
    if (!(await enforceRateLimit(res, `write:${userId}`, RATE_LIMITS.write))) return;
    const items = Array.isArray(req.body) ? req.body : [];
    // Bulk import (pasted rows / CSV) tolerates imperfect input — rows with
    // no opponent, an oversized opponent name, or a malformed date are
    // quietly skipped rather than failing the whole batch.
    const toInsert = items.filter(
      (item) => validString(item?.opponent, { required: true, maxLength: 200 }) && validDateString(item?.date)
    );
    if (!toInsert.length) {
      res.status(400).json({ error: "Expected a non-empty array of { opponent, date } with valid values" });
      return;
    }
    const inserted = [];
    for (const item of toInsert) {
      const [row] = await sql`
        INSERT INTO fixtures (keeper_id, opponent, match_date)
        VALUES (${id}, ${item.opponent}, ${item.date ?? null})
        RETURNING *
      `;
      inserted.push(fixtureToJson(row));
    }
    res.status(201).json(inserted);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandling(handler);
