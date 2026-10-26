// One Valendata run, the way any customer runs it: POST /v1/skills/{slug}/runs, then read the run
// until it ends. Time is measured here, on the caller's side, from request to rows.

import { request } from "../../cli/src/http.mjs";
import { pollUntilDone } from "../../cli/src/poll.mjs";

/** Whether the run read the page with AI: a deep scrape, a repair, or a diagnosis that says so. */
export function usedAi(state) {
  if (state.scrape_mode_used === "deep" || state.heal_kind) return true;
  return JSON.stringify(state.diagnosis || {}).includes("an AI read");
}

/** Refuse to benchmark a skill that never passed its own validation (a draft would misrepresent us). */
export async function requireValidated(settings, slug, fetchImpl = fetch) {
  const skill = await request(settings, "GET", `/v1/skills/${encodeURIComponent(slug)}`, { fetchImpl });
  if (skill.validation_status !== "passed") {
    throw new Error(`${slug} has not passed its own validation (${skill.validation_status || "unknown"}: ` +
      `${String(skill.validation_reason || "").slice(0, 120)}). Fix or rebuild it before benchmarking.`);
  }
}

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
    // The run answer has no token count. Say whether AI read the page (a "deep" read, a repair)
    // instead of claiming 0: null tokens = not reported, never a made-up zero.
    tokens: state.tokens ?? state.ai_tokens ?? null,
    ai_used: usedAi(state),
    ref: run.run_id,
    error: state.error || state.needs_user?.message || null,
  };
}
