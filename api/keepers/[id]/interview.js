import { sql, withCors, interviewResponseToJson, ownsKeeper } from "../../_lib/db.js";
import { requireUser } from "../../_lib/auth.js";
import { validString, validInt, badRequest } from "../../_lib/validate.js";
import { enforceRateLimit, RATE_LIMITS } from "../../_lib/rateLimit.js";
import { withErrorHandling } from "../../_lib/errors.js";

const VALID_TABS = ["Coach", "Parent", "Keeper"];

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
    const rows = await sql`SELECT * FROM interview_responses WHERE keeper_id = ${id}`;
    res.status(200).json(rows.map(interviewResponseToJson));
    return;
  }

  if (req.method === "POST") {
    if (!(await enforceRateLimit(res, `write:${userId}`, RATE_LIMITS.write))) return;
    const { tab, questionIndex, answer } = req.body ?? {};
    const errors = [];
    if (!VALID_TABS.includes(tab)) errors.push(`tab must be one of: ${VALID_TABS.join(", ")}`);
    if (!validInt(questionIndex, { required: true, min: 0, max: 100 })) errors.push("questionIndex is required (non-negative integer, max 100)");
    if (answer !== undefined && answer !== null && !validString(answer, { maxLength: 5000 })) errors.push("answer must be a string (max 5000 chars)");
    if (errors.length) return badRequest(res, errors.join("; "));

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

export default withErrorHandling(handler);
