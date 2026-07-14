// Only accepts the app's own documented YYYY-MM-DD format (same shape the
// backend's validDateString requires) and validates it's a real calendar
// date via a UTC round-trip — entirely without going through `new Date(s)`
// on an arbitrary string. That general parser treats anything without an
// explicit timezone (e.g. a spreadsheet-exported "8/1/2026") as *local*
// midnight, which silently shifts a day backward once converted to UTC for
// any user whose device timezone is ahead of UTC. Rows in another format
// are treated as "no date," matching the existing "skip bad rows rather
// than fail the whole batch" design instead of silently mis-parsing them.
function parseDate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return s;
}

// Accepts pasted text or the raw text of a .csv/.tsv file: one fixture per
// line, "Opponent, Date" (comma or tab separated). Date column is optional.
// A leading header row ("Opponent, Date") is detected and skipped.
export function parseScheduleText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t|,/).map((cell) => cell.trim()))
    .filter(([opponent]) => opponent && !/^opponent$/i.test(opponent))
    .map(([opponent, date]) => ({ opponent, date: parseDate(date) }));
}
