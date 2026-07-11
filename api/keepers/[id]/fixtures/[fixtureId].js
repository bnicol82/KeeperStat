import { sql, withCors } from "../../../_lib/db.js";

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const { id, fixtureId } = req.query;

  if (req.method === "DELETE") {
    await sql`DELETE FROM fixtures WHERE id = ${fixtureId} AND keeper_id = ${id}`;
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
