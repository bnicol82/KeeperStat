import { sql, withCors, interviewResponseToJson, ownsKeeper } from "../../_lib/db.js";
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
    const rows = await sql`SELECT * FROM interview_responses WHERE keeper_id = ${id}`;
    res.status(200).json(rows.map(interviewResponseToJson));
    return;
  }

  if (req.method === "POST") {
    const { tab, questionIndex, answer } = req.body ?? {};
    if (!tab || questionIndex === undefined || questionIndex === null) {
      res.status(400).json({ error: "tab and questionIndex are required" });
      return;
    }
    const [row] = await sql`
      INSERT INTO interview_responses (keeper_id, tab, question_index, answer)
      VALUES (${id}, ${tab}, ${questionIndex}, ${answer ?? ""})
      ON CONFLICT (keeper_id, tab, question_index)
      DO UPDATE SET answer = ${answer ?? ""}, updated_at = now()
      RETURNING *
    `;
    res.status(200).json(interviewResponseToJson(row));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
