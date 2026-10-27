import { request } from "../http.mjs";
import { intFlag, need } from "../args.mjs";
import { printJson } from "../output.mjs";
import { browserLine, browserType } from "../browser.mjs";

/** valendata workflows [--q words] — your workflows. */
export async function workflows(ctx) {
  const { flags } = ctx.args;
  const page = await request(ctx.settings, "GET", "/v1/workflows", {
    query: { q: flags.q, limit: intFlag(flags, "limit") ?? 50 }, fetchImpl: ctx.fetch,
  });
  const list = page?.workflows ?? [];
  printJson(list.map((w) => ({ slug: w.slug, name: w.name })), ctx.out);
}

/**
 * valendata workflow <slug> key=value… [--browser auto|cloud|extension] — run a workflow and wait for
 * its result (POST /v1/workflows/{slug}/run). cloud or extension puts every browser step on that
 * browser for this run; auto (the default) keeps each step's own.
 */
export async function workflow(ctx) {
  const slug = need(ctx.args.rest[0], "a workflow slug");
  const body = { inputs: ctx.args.inputs, wait: true, ...browserType(ctx.args.flags) };
  ctx.err(`Running workflow ${slug}…\n`);
  const answer = await request(ctx.settings, "POST", `/v1/workflows/${encodeURIComponent(slug)}/run`, {
    body, idempotent: true, fetchImpl: ctx.fetch,
  });
  const where = browserLine(answer).trim();
  if (where) ctx.err(`${where}\n`);
  printJson(answer, ctx.out);
}
