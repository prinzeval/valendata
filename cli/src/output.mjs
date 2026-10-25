// How results print. JSON by default (what an agent parses); --csv for rows; --fields keeps
// only the columns asked for, so an agent reads less.

export function pickFields(rows, fields) {
  if (!fields) return rows;
  const keep = String(fields).split(",").map((f) => f.trim()).filter(Boolean);
  return rows.map((row) => Object.fromEntries(keep.map((k) => [k, row?.[k] ?? null])));
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  return [columns.join(","), ...rows.map((row) => columns.map((c) => csvCell(row?.[c])).join(","))].join("\n");
}

export function printJson(value, write = (s) => process.stdout.write(s)) {
  write(JSON.stringify(value, null, 2) + "\n");
}

export function printRows(rows, flags, write = (s) => process.stdout.write(s)) {
  const shown = pickFields(rows || [], flags.fields);
  if (flags.csv) write(toCsv(shown) + "\n");
  else printJson(shown, write);
}
