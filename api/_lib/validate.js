// Lightweight, dependency-free request-body validators shared across API
// routes. Each `valid*` function returns a boolean rather than throwing, so
// a route can collect every problem with a request body and respond with
// one clean 400 instead of letting malformed input (wrong type, negative
// counts, oversized strings) reach the database as an uncaught error.

export function validString(v, { required = false, maxLength = 255 } = {}) {
  if (v === undefined || v === null) return !required;
  if (typeof v !== "string" || v.length > maxLength) return false;
  return !required || v.trim().length > 0;
}

export function validInt(v, { required = false, min = -Infinity, max = Infinity } = {}) {
  if (v === undefined || v === null) return !required;
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

export function validBoolean(v, { required = false } = {}) {
  if (v === undefined || v === null) return !required;
  return typeof v === "boolean";
}

export function validDateString(v, { required = false } = {}) {
  if (v === undefined || v === null) return !required;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return !Number.isNaN(new Date(v).getTime());
}

// A single count stat (saves, punches, distribution attempts, etc.) — always
// a non-negative integer, capped well above anything a real match produces.
export function validStatCount(v, { required = false } = {}) {
  return validInt(v, { required, min: 0, max: 500 });
}

export function badRequest(res, error) {
  res.status(400).json({ error });
  return false;
}
