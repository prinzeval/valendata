import { request } from "../http.mjs";
import { intFlag } from "../args.mjs";
import { printJson } from "../output.mjs";

/** valendata workflows [--q words] — your workflows. */
export async function workflows(ctx) {
  const { flags } = ctx.args;
  const page = await request(ctx.settings, "GET", "/v1/workflows", {
    query: { q: flags.q, limit: intFlag(flags, "limit") ?? 50 }, fetchImpl: ctx.fetch,
  });
  const list = page?.workflows ?? [];
  printJson(list.map((w) => ({ slug: w.slug, name: w.name })), ctx.out);
}

/** valendata workflow <slug> key=value… — run a workflow and wait for its result (POST /v1/workflows/{slug}/run). */
export async function workflow(ctx) {
  const slug = ctx.args.rest[0];
  if (!slug) throw new Error("Missing a workflow slug. See `valendata help`.");
  ctx.err(`Running workflow ${slug}…\n`);
  const answer = await request(ctx.settings, "POST", `/v1/workflows/${encodeURIComponent(slug)}/run`, {
    body: { inputs: ctx.args.inputs, wait: true }, idempotent: true, fetchImpl: ctx.fetch,
  });
  printJson(answer, ctx.out);
}
