import { sql, withCors, matchVideoToJson, ownsKeeper } from "../../../../_lib/db.js";
import { requireUser } from "../../../../_lib/auth.js";
import { validString, badRequest } from "../../../../_lib/validate.js";
import { enforceRateLimit, RATE_LIMITS } from "../../../../_lib/rateLimit.js";
import { withErrorHandling } from "../../../../_lib/errors.js";

// Every Record Film session becomes its own row here rather than a single
// matches.video_url column, which could only ever remember the most recent
// recording — starting a second clip used to silently erase the first.
async function handler(req, res) {
  if (withCors(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;
  const { id, matchId } = req.query;
  if (!(await ownsKeeper(id, userId))) {
    res.status(404).json({ error: "Keeper not found" });
    return;
  }

  if (req.method === "GET") {
    const rows = await sql`
      SELECT * FROM match_videos WHERE match_id = ${matchId} ORDER BY created_at ASC
    `;
    res.status(200).json(rows.map(matchVideoToJson));
    return;
  }

  if (req.method === "POST") {
    if (!(await enforceRateLimit(res, `write:${userId}`, RATE_LIMITS.write))) return;
    const { videoUrl, kind } = req.body ?? {};
    if (!validString(videoUrl, { required: true, maxLength: 2000 })) {
      return badRequest(res, "videoUrl is required (string, max 2000 chars)");
    }
    if (kind !== undefined && kind !== "clip" && kind !== "highlights") {
      return badRequest(res, "kind must be 'clip' or 'highlights'");
    }
    const [row] = await sql`
      INSERT INTO match_videos (match_id, video_url, kind) VALUES (${matchId}, ${videoUrl}, ${kind ?? "clip"}) RETURNING *
    `;
    res.status(201).json(matchVideoToJson(row));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

export default withErrorHandling(handler);
