// One Valendata run, the way any customer runs it: POST /v1/skills/{slug}/runs, then read the run
// until it ends. Time is measured here, on the caller's side, from request to rows.

import { request } from "../../cli/src/http.mjs";
import { pollUntilDone } from "../../cli/src/poll.mjs";

export async function runValendata({ task, config, keys, pricing, fetchImpl = fetch, sleep, now = Date.now }) {
  const settings = keys.valendata;
  const started = now();
  const run = await request(settings, "POST", `/v1/skills/${encodeURIComponent(config.slug)}/runs`, {
    body: { inputs: config.inputs || {}, max_results: task.limit }, idempotent: true, fetchImpl,
  });
  const read = () => request(settings, "GET", `/v1/runs/${encodeURIComponent(run.run_id)}`, { fetchImpl });
  const { state, done } = await pollUntilDone(read, { everyMs: 1000, maxMs: 10 * 60 * 1000, sleep, now });
  const seconds = (now() - started) / 1000;
  const credits = Number(state.credits_charged ?? 0);
  return {
    ok: done && ["success", "completed", "partial"].includes(String(state.status).toLowerCase()),
    status: done ? state.status : "timeout",
    seconds,
    output: (state.rows || []).slice(0, task.limit),
    usd: credits * pricing.valendata.usd_per_credit,
    spent: { credits },
    // Replays use no AI; tokens are only spent when a run repairs itself.
    tokens: Number(state.tokens ?? state.ai_tokens ?? 0),
    ref: run.run_id,
    error: state.error || state.needs_user?.message || null,
  };
}
