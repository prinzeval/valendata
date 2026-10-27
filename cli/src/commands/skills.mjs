import { request } from "../http.mjs";
import { intFlag, need } from "../args.mjs";
import { printJson, printRows, pickFields } from "../output.mjs";
import { pollUntilDone } from "../poll.mjs";
import { browserLine, browserType, creationBrowser } from "../browser.mjs";


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
 * valendata run <slug> key=value… [--max 20] [--fields a,b] [--csv] [--json] [--no-wait] [--wait-seconds 900] [--full]
 *                                  [--browser auto|cloud|extension]
 * Starts the run in the background (POST /v1/skills/{slug}/runs, so a long run never times out),
 * waits for it, and prints its rows (--json: the rows with the run's status, cost and browser).
 */
export async function run(ctx) {
  const slug = need(ctx.args.rest[0], "a skill slug");
  const { flags, inputs } = ctx.args;
  const started = await request(ctx.settings, "POST", `/v1/skills/${encodeURIComponent(slug)}/runs`, {
    body: { inputs, max_results: intFlag(flags, "max") ?? 20, ...browserType(flags) }, idempotent: true, fetchImpl: ctx.fetch,
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
  const count = state.count ?? (state.rows || []).length;
  ctx.err(`${status}: ${count} rows, ${state.credits_charged ?? "?"} credits.` + browserLine(state) +
    (status === "partial" && state.error ? ` Note: ${state.error}` : "") + "\n");
  if (flags.json) {
    return printJson({
      run_id: runId, status, count, credits_charged: state.credits_charged ?? null,
      browser_used: state.browser_used ?? null, browser_note: state.browser_note ?? null,
      rows: pickFields(state.rows || [], flags.fields),
    }, ctx.out);
  }
  return printRows(state.rows || [], flags, ctx.out);
}

const CREATION_DONE = new Set(["ready", "needs_fix", "failed", "cancelled"]);

/**
 * valendata create <task words> --url <start_url> [key=example …] [--name x] [--fields a,b]
 *                  [--browser auto|cloud|extension] [--no-wait] [--wait-seconds 900]
 * Builds a new skill (POST /v1/skills): key=value words are its inputs with the example value the
 * recording uses, --fields the columns each row returns. Waits for it and prints the new slug.
 */
export async function create(ctx) {
  const task = need(ctx.args.rest.join(" "), "what the skill should do");
  const { flags, inputs } = ctx.args;
  const startUrl = need(typeof flags.url === "string" && flags.url, "--url (the page the skill starts on)");
  const body = { task, start_url: startUrl, ...creationBrowser(flags) };
  if (typeof flags.name === "string") body.name = flags.name;
  if (Object.keys(inputs).length) body.inputs = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, String(v)]));
  if (typeof flags.fields === "string") body.output_fields = flags.fields.split(",").map((f) => f.trim()).filter(Boolean);
  const started = await request(ctx.settings, "POST", "/v1/skills", { body, idempotent: true, fetchImpl: ctx.fetch });
  const id = started.creation_id;
  if (flags["no-wait"]) return printJson({ creation_id: id, status: started.status }, ctx.out);
  ctx.err(`Creating the skill (creation ${id}). It takes a few minutes…\n`);
  let said = "";
  const read = async () => {
    const state = await request(ctx.settings, "GET", `/v1/skill-creations/${encodeURIComponent(id)}`, { fetchImpl: ctx.fetch });
    if (state?.progress && state.progress !== said) ctx.err(`  ${(said = state.progress)}\n`);
    return state;
  };
  const { state, done } = await pollUntilDone(read, {
    everyMs: 10000, maxMs: (intFlag(flags, "wait-seconds") ?? 900) * 1000, sleep: ctx.sleep, done: CREATION_DONE,
  });
  if (!done) {
    ctx.err(`Still creating; it keeps going on Valendata. Check it in the app (creation ${id}).\n`);
    return printJson({ creation_id: id, status: state.status }, ctx.out);
  }
  const status = String(state.status);
  if (status === "failed" || status === "cancelled") {
    throw new Error(`Creation ${id} ${status}: ${state.error || state.next_step || "no reason given"}`);
  }
  ctx.err(status === "ready"
    ? `ready: run it with \`valendata run ${state.slug}\`.\n`
    : "needs_fix: a draft skill was saved but its test replay did not pass. Fix it (the improve_skill tool or the app); do not create it again.\n");
  return printJson({
    slug: state.slug, name: state.name, status, inputs: state.inputs, output_fields: state.output_fields,
    browser: state.browser, source: state.source, credits_charged: state.credits_charged,
  }, ctx.out);
}
