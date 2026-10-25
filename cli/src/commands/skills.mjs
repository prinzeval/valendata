import { request } from "../http.mjs";
import { intFlag } from "../args.mjs";
import { printJson, printRows } from "../output.mjs";
import { pollUntilDone } from "../poll.mjs";

const need = (value, what) => {
  if (!value) throw new Error(`Missing ${what}. See \`valendata help\`.`);
  return value;
};

/** valendata search <task words> [--site x.com] [--limit 5] [--kind workflow] — the marketplace and your own. */
export async function search(ctx) {
  const q = need(ctx.args.rest.join(" "), "what to search for");
  const { flags } = ctx.args;
  const found = await request(ctx.settings, "GET", "/v1/marketplace/search", {
    query: { q, site: flags.site, limit: intFlag(flags, "limit") ?? 5, kind: flags.kind }, fetchImpl: ctx.fetch,
  });
  printJson((found.results || []).map((r) => ({
    slug: r.slug, name: r.name, site: r.site, yours: r.yours, match: r.match,
    inputs: (r.inputs || []).map((i) => `${i.name}${i.required ? "*" : ""}`),
    price_credits: r.price?.estimate_credits, success_rate: r.health?.success_rate_20,
  })), ctx.out);
}

/** valendata skills [--q words] [--limit 50] — your skills. */
export async function skills(ctx) {
  const { flags } = ctx.args;
  const page = await request(ctx.settings, "GET", "/v1/skills", {
    query: { q: flags.q, limit: intFlag(flags, "limit") ?? 50, cursor: flags.cursor }, fetchImpl: ctx.fetch,
  });
  printJson((page.skills || []).map((s) => ({ slug: s.slug, name: s.name, status: s.status })), ctx.out);
}

/** valendata info <slug> — inputs, output fields and price. */
export async function info(ctx) {
  const slug = need(ctx.args.rest[0], "a skill slug");
  printJson(await request(ctx.settings, "GET", `/v1/skills/${encodeURIComponent(slug)}`, { fetchImpl: ctx.fetch }), ctx.out);
}

/** valendata clone <slug> — copy a public skill (free); run the copy's slug. */
export async function clone(ctx) {
  const slug = need(ctx.args.rest[0], "a skill slug");
  const copy = await request(ctx.settings, "POST", `/v1/skills/${encodeURIComponent(slug)}/clone`, { fetchImpl: ctx.fetch });
  printJson({ slug: copy.slug, name: copy.name, cloned_from: slug }, ctx.out);
}

/**
 * valendata run <slug> key=value… [--max 20] [--fields a,b] [--csv] [--no-wait] [--wait-seconds 900] [--full]
 * Starts the run in the background (POST /v1/skills/{slug}/runs, so a long run never times out),
 * waits for it, and prints its rows.
 */
export async function run(ctx) {
  const slug = need(ctx.args.rest[0], "a skill slug");
  const { flags, inputs } = ctx.args;
  const started = await request(ctx.settings, "POST", `/v1/skills/${encodeURIComponent(slug)}/runs`, {
    body: { inputs, max_results: intFlag(flags, "max") ?? 20 }, idempotent: true, fetchImpl: ctx.fetch,
  });
  if (flags["no-wait"]) return printJson({ run_id: started.run_id, status: started.status }, ctx.out);
  ctx.err(`Running ${slug} (run ${started.run_id})…\n`);
  return showRun(ctx, started.run_id);
}

/** valendata runs <run_id> — a run's status and rows (waits while it is still going). */
export async function runs(ctx) {
  return showRun(ctx, need(ctx.args.rest[0], "a run id"));
}

/** valendata cancel <run_id> */
export async function cancel(ctx) {
  const id = need(ctx.args.rest[0], "a run id");
  printJson(await request(ctx.settings, "POST", `/v1/runs/${encodeURIComponent(id)}/cancel`, { fetchImpl: ctx.fetch }), ctx.out);
}

async function showRun(ctx, runId) {
  const { flags } = ctx.args;
  const read = () => request(ctx.settings, "GET", `/v1/runs/${encodeURIComponent(runId)}`, { fetchImpl: ctx.fetch });
  const { state, done } = await pollUntilDone(read, {
    maxMs: (intFlag(flags, "wait-seconds") ?? 900) * 1000, sleep: ctx.sleep,
  });
  if (!done) {
    ctx.err(`Still running. Read it later with: valendata runs ${runId}\n`);
    return printJson({ run_id: runId, status: state.status }, ctx.out);
  }
  if (flags.full) return printJson(state, ctx.out);
  const status = String(state.status);
  if (status === "failed" || status === "cancelled") {
    const why = state.needs_user?.message || state.error || "no reason given";
    throw new Error(`Run ${runId} ${status}: ${why}`);
  }
  ctx.err(`${status}: ${state.count ?? (state.rows || []).length} rows, ${state.credits_charged ?? "?"} credits.` +
    (status === "partial" && state.error ? ` Note: ${state.error}` : "") + "\n");
  return printRows(state.rows || [], flags, ctx.out);
}
