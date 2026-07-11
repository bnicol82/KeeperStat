import { sql, withCors, fixtureToJson } from "../../_lib/db.js";

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const { id } = req.query;

  if (req.method === "GET") {
    const rows = await sql`
      SELECT * FROM fixtures WHERE keeper_id = ${id}
      ORDER BY match_date ASC NULLS LAST, created_at ASC
    `;
    res.status(200).json(rows.map(fixtureToJson));
    return;
  }

  if (req.method === "POST") {
    const items = Array.isArray(req.body) ? req.body : [];
    const toInsert = items.filter((item) => item?.opponent);
    if (!toInsert.length) {
      res.status(400).json({ error: "Expected a non-empty array of { opponent, date }" });
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
