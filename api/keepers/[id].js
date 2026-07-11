import { sql, withCors, keeperToJson } from "../_lib/db.js";

export default async function handler(req, res) {
  if (withCors(req, res)) return;
  const { id } = req.query;

  if (req.method === "PATCH") {
    const patch = req.body ?? {};
    const [existing] = await sql`SELECT * FROM keepers WHERE id = ${id}`;
    if (!existing) {
      res.status(404).json({ error: "Keeper not found" });
      return;
    }

    const next = {
      name: patch.name ?? existing.name,
      team: patch.team ?? existing.team,
      level: patch.level ?? existing.level,
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
        focus_area_title = ${next.focus_area_title},
        focus_area_note = ${next.focus_area_note},
        next_goal = ${next.next_goal},
        show_gmis = ${next.show_gmis},
        match_reminders = ${next.match_reminders},
        weekly_summary = ${next.weekly_summary}
      WHERE id = ${id}
      RETURNING *
    `;
    res.status(200).json(keeperToJson(row));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
