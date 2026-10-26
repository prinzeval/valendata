#!/usr/bin/env node
// Turn result lines into the table people check: per task and tool, the median time and cost,
// tokens, rows, how full the rows are, how many runs worked, and whether every working run gave
// the same answer. Writes <results>.summary.json (the videos read it) and prints Markdown.
//
//   node bench/report.mjs bench/results/2026-10-26.jsonl

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function median(numbers) {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The 95th percentile (nearest rank): the slow end people actually wait for. */
export function p95(numbers) {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
}

export function summarise(lines) {
  const groups = new Map();
  for (const line of lines) {
    const key = `${line.task}|${line.tool}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }
  return [...groups.values()].map((runs) => {
    const worked = runs.filter((r) => r.ok);
    const answers = new Set(worked.map((r) => r.answer));
    // "Same answer" is judged within each page version: a page that changed mid-race is not a tool's fault.
    const byVersion = new Map();
    for (const r of worked) {
      const key = r.page_version || "unknown";
      if (!byVersion.has(key)) byVersion.set(key, new Set());
      byVersion.get(key).add(r.answer);
    }
    const comparable = [...byVersion.values()].filter((set) => set.size > 0);
    const steadyPerVersion = worked.length > 1 ? comparable.every((set) => set.size === 1) : null;
    return {
      task: runs[0].task,
      tool: runs[0].tool,
      runs: runs.length,
      worked: worked.length,
      median_seconds: median(worked.map((r) => r.seconds)),
      median_usd: median(runs.map((r) => r.usd)),
      usd_is_estimate: runs.some((r) => r.usd_is_estimate),
      median_tokens: median(runs.map((r) => r.tokens).filter((t) => t !== null && t !== undefined)),
      ai_read: runs.some((r) => r.ai_used === true),
      median_rows: median(worked.map((r) => r.rows)),
      median_fill: median(worked.map((r) => r.fill)),
      median_correct: median(worked.map((r) => r.correct).filter((c) => c !== null && c !== undefined)),
      p95_seconds: p95(worked.map((r) => r.seconds)),
      same_answer_every_run: steadyPerVersion,
      page_versions: byVersion.size,
      distinct_answers: answers.size,
    };
  });
}

export function markdown(rows) {
  const head = "| Task | Tool | Worked | Time (median) | Time (P95) | Cost per run | AI tokens | Rows | Fields filled | Correct on the page | Same answer every run |\n" +
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |";
  const fmt = (v, f) => (v === null || v === undefined ? "—" : f(v));
  const body = rows.map((r) => [
    r.task, r.tool, `${r.worked}/${r.runs}`,
    fmt(r.median_seconds, (v) => `${v.toFixed(1)} s`),
    fmt(r.p95_seconds, (v) => `${v.toFixed(1)} s`),
    fmt(r.median_usd, (v) => `$${v.toFixed(4)}${r.usd_is_estimate ? " (est.)" : ""}`),
    r.median_tokens !== null ? Math.round(r.median_tokens).toLocaleString("en-US") : r.ai_read ? "not reported (AI read the page)" : "—",
    fmt(r.median_rows, String),
    fmt(r.median_fill, (v) => `${Math.round(v * 100)}%`),
    fmt(r.median_correct, (v) => `${Math.round(v * 100)}%`),
    r.same_answer_every_run === null ? "—" : r.same_answer_every_run ? "yes" : `no (${r.distinct_answers} different)`,
  ].join(" | ")).map((line) => `| ${line} |`);
  return [head, ...body].join("\n");
}

async function main(path) {
  if (!path) throw new Error("Give the results file: node bench/report.mjs bench/results/<date>.jsonl");
  const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const rows = summarise(lines);
  await writeFile(path.replace(/\.jsonl$/, ".summary.json"), JSON.stringify(rows, null, 2) + "\n");
  console.log(markdown(rows));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
