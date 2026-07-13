import { sql, withCors, keeperToJson } from "../_lib/db.js";
import { requireUser } from "../_lib/auth.js";
import { validString, validBoolean, badRequest } from "../_lib/validate.js";
import { LEVELS } from "../../shared/scoring.js";

const LEVEL_KEYS = Object.keys(LEVELS);

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;
  const { id } = req.query;

  if (req.method === "PATCH") {
    const patch = req.body ?? {};
    const errors = [];
    if (patch.name !== undefined && !validString(patch.name, { required: true, maxLength: 200 })) errors.push("name must be a non-empty string (max 200 chars)");
    if (patch.team !== undefined && !validString(patch.team, { required: true, maxLength: 200 })) errors.push("team must be a non-empty string (max 200 chars)");
    if (patch.level !== undefined && !LEVEL_KEYS.includes(patch.level)) errors.push(`level must be one of: ${LEVEL_KEYS.join(", ")}`);
    if (patch.photoUrl !== undefined && patch.photoUrl !== null && !validString(patch.photoUrl, { maxLength: 2000 })) errors.push("photoUrl must be a string");
    if (patch.rankingsUrl !== undefined && patch.rankingsUrl !== null && !validString(patch.rankingsUrl, { maxLength: 2000 })) errors.push("rankingsUrl must be a string");
    if (patch.isPublic !== undefined && !validBoolean(patch.isPublic)) errors.push("isPublic must be a boolean");
    if (patch.nextGoal !== undefined && patch.nextGoal !== null && !validString(patch.nextGoal, { maxLength: 500 })) errors.push("nextGoal must be a string");
    if (patch.focusArea !== undefined && patch.focusArea !== null) {
      if (typeof patch.focusArea !== "object" || Array.isArray(patch.focusArea)) {
        errors.push("focusArea must be an object with a title");
      } else {
        if (!validString(patch.focusArea.title, { required: true, maxLength: 200 })) errors.push("focusArea.title is required (string, max 200 chars)");
        if (patch.focusArea.note !== undefined && patch.focusArea.note !== null && !validString(patch.focusArea.note, { maxLength: 1000 })) errors.push("focusArea.note must be a string");
      }
    }
    if (patch.showGMIS !== undefined && !validBoolean(patch.showGMIS)) errors.push("showGMIS must be a boolean");
    if (patch.notifPrefs !== undefined && patch.notifPrefs !== null) {
      if (typeof patch.notifPrefs !== "object" || Array.isArray(patch.notifPrefs)) {
        errors.push("notifPrefs must be an object");
      } else {
        if (patch.notifPrefs.matchReminders !== undefined && !validBoolean(patch.notifPrefs.matchReminders)) errors.push("notifPrefs.matchReminders must be a boolean");
        if (patch.notifPrefs.weeklySummary !== undefined && !validBoolean(patch.notifPrefs.weeklySummary)) errors.push("notifPrefs.weeklySummary must be a boolean");
      }
    }
    if (errors.length) return badRequest(res, errors.join("; "));

    const [existing] = await sql`SELECT * FROM keepers WHERE id = ${id} AND user_id = ${userId}`;
    if (!existing) {
      res.status(404).json({ error: "Keeper not found" });
      return;
    }

    const next = {
      name: patch.name ?? existing.name,
      team: patch.team ?? existing.team,
      level: patch.level ?? existing.level,
      photo_url: patch.photoUrl !== undefined ? patch.photoUrl : existing.photo_url,
      rankings_url: patch.rankingsUrl !== undefined ? patch.rankingsUrl : existing.rankings_url,
      is_public: patch.isPublic ?? existing.is_public,
      focus_area_title: patch.focusArea !== undefined ? patch.focusArea?.title ?? null : existing.focus_area_title,
      focus_area_note: patch.focusArea !== undefined ? patch.focusArea?.note ?? null : existing.focus_area_note,
      next_goal: patch.nextGoal !== undefined ? patch.nextGoal : existing.next_goal,
      show_gmis: patch.showGMIS ?? existing.show_gmis,
      match_reminders: patch.notifPrefs?.matchReminders ?? existing.match_reminders,
      weekly_summary: patch.notifPrefs?.weeklySummary ?? existing.weekly_summary,
    };

    const [row] = await sql`
      UPDATE keepers SET
        name = ${next.name},
        team = ${next.team},
        level = ${next.level},
        photo_url = ${next.photo_url},
        rankings_url = ${next.rankings_url},
        is_public = ${next.is_public},
        focus_area_title = ${next.focus_area_title},
        focus_area_note = ${next.focus_area_note},
        next_goal = ${next.next_goal},
        show_gmis = ${next.show_gmis},
        match_reminders = ${next.match_reminders},
        weekly_summary = ${next.weekly_summary}
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *
    `;
    res.status(200).json(keeperToJson(row));
    return;
  }

  if (req.method === "DELETE") {
    const [existing] = await sql`SELECT id FROM keepers WHERE id = ${id} AND user_id = ${userId}`;
    if (!existing) {
      res.status(404).json({ error: "Keeper not found" });
      return;
    }
    await sql`DELETE FROM keepers WHERE id = ${id} AND user_id = ${userId}`;
    res.status(204).end();
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
