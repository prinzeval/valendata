import { request } from "../http.mjs";
import { intFlag, need } from "../args.mjs";
import { printJson } from "../output.mjs";
import { browserType } from "../browser.mjs";

/** --every or --cron: exactly one when `required`, at most one otherwise. */
function cadence(flags, { required }) {
  const every = typeof flags.every === "string" ? flags.every : undefined;
  const cron = typeof flags.cron === "string" ? flags.cron : undefined;
  if (every && cron) throw new Error("Give --every or --cron, not both.");
  if (required && !every && !cron) throw new Error('Missing how often: --every "daily 09:00" (or 2h, weekly mon 09:00) or --cron "0 9 * * 1-5".');
  return every ? { every } : cron ? { cron } : {};
}

/** The browser a schedule's runs use, in the --browser words (null in the answer = automatic). */
const browserWord = (type) => (type === "remote" ? "cloud" : type || "auto");

/**
 * valendata schedule <slug> key=value… --every "daily 09:00" | --cron "0 9 * * 1-5" [--timezone UTC] [--max 100]
 *                    [--workflow] [--browser auto|cloud|extension]
 * Runs a skill (or, with --workflow, a workflow) on a schedule: POST /v1/skills/{slug}/schedules
 * or /v1/workflows/{slug}/schedules. Every scheduled run spends credits.
 */
export async function schedule(ctx) {
  const slug = need(ctx.args.rest[0], ctx.args.flags.workflow ? "a workflow slug" : "a skill slug");
  const { flags, inputs } = ctx.args;
  const body = { ...cadence(flags, { required: true }), inputs, ...browserType(flags) };
  if (typeof flags.timezone === "string") body.timezone = flags.timezone;
  const max = intFlag(flags, "max");
  if (max !== undefined) {
    if (flags.workflow) throw new Error("--max is for skill schedules; a workflow sets its own rows.");
    body.max_results = max;
  }
  const kind = flags.workflow ? "workflows" : "skills";
  printJson(await request(ctx.settings, "POST", `/v1/${kind}/${encodeURIComponent(slug)}/schedules`, {
    body, fetchImpl: ctx.fetch,
  }), ctx.out);
}

/** valendata schedules [--kind skill|workflow] [--limit 50] — every schedule (GET /v1/schedules). */
export async function schedules(ctx) {
  const { flags } = ctx.args;
  const page = await request(ctx.settings, "GET", "/v1/schedules", {
    query: { kind: flags.kind, limit: intFlag(flags, "limit") ?? 50, cursor: flags.cursor }, fetchImpl: ctx.fetch,
  });
  printJson((page?.schedules || []).map((s) => ({
    id: s.id, kind: s.kind, slug: s.skill_slug ?? s.workflow_slug, every: s.every ?? null, cron: s.cron ?? null,
    timezone: s.timezone, enabled: s.enabled, browser: browserWord(s.browser_type), next_run_at: s.next_run_at ?? null,
  })), ctx.out);
}

/**
 * valendata schedule-update <schedule_id> [key=value…] [--every …|--cron …] [--timezone x] [--max n]
 *                           [--browser auto|cloud|extension]
 * Changes only what is given (PATCH /v1/schedules/{id}); key=value words replace its inputs, and
 * --browser auto puts its runs back on automatic.
 */
export async function scheduleUpdate(ctx) {
  const id = need(ctx.args.rest[0], "a schedule id (see `valendata schedules`)");
  const { flags, inputs } = ctx.args;
  const body = { ...cadence(flags, { required: false }), ...browserType(flags, { clear: true }) };
  if (typeof flags.timezone === "string") body.timezone = flags.timezone;
  if (Object.keys(inputs).length) body.inputs = inputs;
  const max = intFlag(flags, "max");
  if (max !== undefined) body.max_results = max;
  if (!Object.keys(body).length) {
    throw new Error("Nothing to change: give --every, --cron, --timezone, --max, --browser or key=value inputs.");
  }
  printJson(await request(ctx.settings, "PATCH", `/v1/schedules/${encodeURIComponent(id)}`, {
    body, fetchImpl: ctx.fetch,
  }), ctx.out);
}
