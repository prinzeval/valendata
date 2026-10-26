// Is each row's text really on the page? The page is fetched once per run, at the moment the run
// ends, and a row counts as correct when its checked field (task.truth.field) appears in the page's
// text after the same clean-up on both sides. This catches invented, garbled or wrong-field values
// that "fields filled" cannot see.

import { createHash } from "node:crypto";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-" };

/** Page HTML as plain text, the way a reader sees it (links run on inside sentences). */
export function pageText(html) {
  return String(html)
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(p|li|div|h[1-6]|tr|td|br|dd|dt)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

/** The same clean-up for page and value: Unicode, dashes, quotes, spacing, case. */
export function norm(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[​-‍­]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Share of rows (0..1) whose checked field is on the page; a cut-short value ("…") counts by its start. */
export function correctShare(rows, field, page) {
  if (!rows.length) return 0;
  const text = norm(page);
  let hit = 0;
  for (const row of rows) {
    const value = norm(row[field]).replace(/(\.\.\.|…)$/, "").trim();
    if (value.length >= 12 && text.includes(value.slice(0, 160))) hit += 1;
  }
  return hit / rows.length;
}

export async function fetchPage(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers: { "User-Agent": "valendata-bench (+https://github.com/prinzeval/valendata)" } });
  return response.ok ? await response.text() : "";
}

/** Which version of the page a run met: a hash of the text a reader sees. Runs are compared for
 * "same answer" only against runs that met the same text. Not a wiki's revision number: a portal
 * that pulls in sub-pages keeps its number while a sub-page is edited (seen 2026-10-26: an event
 * sentence was edited between runs while wgCurRevisionId stayed the same). */
export function pageVersion(html) {
  return "text:" + createHash("sha256").update(norm(pageText(html))).digest("hex").slice(0, 12);
}
