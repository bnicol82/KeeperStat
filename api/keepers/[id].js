import { sql, withCors, keeperToJson } from "../_lib/db.js";
import { requireUser } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const userId = await requireUser(req, res);
  if (!userId) return;
  const { id } = req.query;

  if (req.method === "PATCH") {
    const patch = req.body ?? {};
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
