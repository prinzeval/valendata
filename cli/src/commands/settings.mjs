import { request } from "../http.mjs";
import { need } from "../args.mjs";
import { printJson } from "../output.mjs";
import { browserFlag, browserType } from "../browser.mjs";

/**
 * valendata update <slug> --browser auto|cloud|extension [--workflow]
 * Saves the browser a skill runs on when a run does not pick one (PATCH /v1/skills/{slug}); with
 * --workflow, the browser of every browser step in a workflow (PATCH /v1/workflows/{slug}).
 * auto takes the saved choice away, so Valendata picks again.
 */
export async function update(ctx) {
  const { flags } = ctx.args;
  const slug = need(ctx.args.rest[0], flags.workflow ? "a workflow slug" : "a skill slug");
  const body = browserType(flags, { clear: true });
  if (!Object.keys(body).length) throw new Error("Nothing to change: give --browser auto, cloud or extension.");
  const kind = flags.workflow ? "workflows" : "skills";
  const answer = await request(ctx.settings, "PATCH", `/v1/${kind}/${encodeURIComponent(slug)}`, { body, fetchImpl: ctx.fetch });
  printJson({ slug: answer?.slug ?? slug, kind: flags.workflow ? "workflow" : "skill", browser: browserFlag(flags) }, ctx.out);
}
