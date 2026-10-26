// What a tool gave back, measured the same way for every tool: how many rows, how full they
// are, and a fingerprint of the answer so "same answer every run?" is a plain comparison.

import { createHash } from "node:crypto";

/** The list of rows inside whatever a tool returned (an array, or the first array field of an object). */
export function rowsOf(value) {
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === "object");
  if (value && typeof value === "object") {
    for (const key of ["rows", "items", "results", "data", "posts", "latestPosts"]) {
      if (Array.isArray(value[key])) return rowsOf(value[key]);
      if (value[key] && typeof value[key] === "object") {
        const inner = rowsOf(value[key]);
        if (inner.length) return inner;
      }
    }
    const firstList = Object.values(value).find(Array.isArray);
    if (firstList) return rowsOf(firstList);
  }
  return [];
}

function filled(cell) {
  if (cell === null || cell === undefined) return false;
  if (typeof cell === "string") return cell.trim() !== "";
  return true;
}

/** Share of the asked-for cells that came back with a value (0..1); a field is found case-insensitively. */
export function fillRate(rows, fields) {
  if (!rows.length || !fields.length) return 0;
  let hit = 0;
  for (const row of rows) {
    const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
    for (const field of fields) if (filled(lower[field.toLowerCase()])) hit += 1;
  }
  return hit / (rows.length * fields.length);
}

function normalise(value) {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k.toLowerCase(), normalise(value[k])]));
  }
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;
}

/** A short fingerprint of the asked-for fields of the rows, in order: equal answers, equal prints. */
export function fingerprint(rows, fields) {
  const picked = rows.map((row) => {
    const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
    return fields.map((field) => normalise(lower[field.toLowerCase()] ?? null));
  });
  return createHash("sha256").update(JSON.stringify(picked)).digest("hex").slice(0, 12);
}
