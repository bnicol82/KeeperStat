import { handleUpload } from "@vercel/blob/client";
import { withCors, ownsKeeper } from "../../../../_lib/db.js";
import { requireUser } from "../../../../_lib/auth.js";
import { enforceRateLimit, RATE_LIMITS } from "../../../../_lib/rateLimit.js";
import { withErrorHandling } from "../../../../_lib/errors.js";

async function handler(req, res) {
  if (withCors(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;
  const { id, matchId } = req.query;
  if (!(await ownsKeeper(id, userId))) {
    res.status(404).json({ error: "Keeper not found" });
    return;
  }
  if (!(await enforceRateLimit(res, `video:${userId}`, RATE_LIMITS.videoUpload))) return;

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`keepers/${id}/matches/${matchId}/`)) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: ["video/webm", "video/mp4", "video/quicktime"],
          // A full match recorded in-browser (60-90 min, modest bitrate) can
          // run several hundred MB — well above the 8MB photo cap.
          maximumSizeInBytes: 500 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export default withErrorHandling(handler);
