import { handleUpload } from "@vercel/blob/client";
import { withCors, ownsKeeper } from "../../_lib/db.js";
import { requireUser } from "../../_lib/auth.js";
import { enforceRateLimit, RATE_LIMITS } from "../../_lib/rateLimit.js";

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;
  const { id } = req.query;
  if (!(await ownsKeeper(id, userId))) {
    res.status(404).json({ error: "Keeper not found" });
    return;
  }
  if (!(await enforceRateLimit(res, `photo:${userId}`, RATE_LIMITS.photoUpload))) return;

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`keepers/${id}/`)) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
          maximumSizeInBytes: 8 * 1024 * 1024,
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
