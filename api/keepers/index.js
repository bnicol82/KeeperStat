import { sql, withCors, keeperToJson } from "../_lib/db.js";

export default async function handler(req, res) {
  if (withCors(req, res)) return;

  if (req.method === "GET") {
    const rows = await sql`SELECT * FROM keepers ORDER BY created_at ASC`;
    res.status(200).json(rows.map(keeperToJson));
    return;
  }

  if (req.method === "POST") {
    const { name, team, level } = req.body ?? {};
    if (!name || !team) {
      res.status(400).json({ error: "name and team are required" });
      return;
    }
    const [row] = await sql`
      INSERT INTO keepers (name, team, level)
      VALUES (${name}, ${team}, ${level ?? "youth"})
      RETURNING *
    `;
    res.status(201).json(keeperToJson(row));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
