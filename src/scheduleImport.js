function parseDate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
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
