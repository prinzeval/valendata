import assert from "node:assert/strict";
import { test } from "node:test";

import { fillRate, fingerprint, rowsOf } from "../lib/rows.mjs";
import { estimate, planRuns, resultLine } from "../run.mjs";
import { markdown, median, summarise } from "../report.mjs";
import { runValendata } from "../tools/valendata.mjs";
import { runApify } from "../tools/apify.mjs";
import { lastJsonLine } from "../tools/browser_use.mjs";

const pricing = {
  valendata: { usd_per_credit: 0.01, estimate_credits_per_run: 4 },
  firecrawl: { estimate_usd_per_run: 0.05 },
  apify: { estimate_usd_per_run: 0.05 },
  browser_use: { estimate_usd_per_run: 0.03 },
};
const task = { id: "wikipedia", url: "https://x", prompt: "p", fields: ["headline", "link"], limit: 2,
  tools: { valendata: { slug: "wikipedia-current-events" }, browser_use: {} } };
const ready = { valendata: "ready", firecrawl: "needs FIRECRAWL_API_KEY", apify: "needs APIFY_TOKEN", browser_use: "ready" };

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

test("rows are found inside any answer shape, and measured the same way", () => {
  const rows = rowsOf({ data: { items: [{ Headline: "A", link: "u" }, { headline: "", link: "v" }] } });
  assert.equal(rows.length, 2);
  assert.equal(fillRate(rows, ["headline", "link"]), 0.75);
  assert.equal(fingerprint(rows, ["headline", "link"]), fingerprint([{ headline: "A ", LINK: "u" }, { headline: "", link: "v" }], ["headline", "link"]));
  assert.notEqual(fingerprint(rows, ["headline"]), fingerprint([{ headline: "B" }], ["headline"]));
});

test("the plan skips what is missing and says why; nothing is planned without its key", () => {
  const { planned, skipped } = planRuns([task], { taskIds: [], toolIds: ["valendata", "firecrawl", "browser_use"], runs: 2 }, ready);
  assert.equal(planned.length, 4);
  assert.deepEqual(skipped, [{ task: "wikipedia", tool: "firecrawl", why: "no entry for this tool" }]);
  const noSlug = { ...task, tools: { valendata: { slug: null, note: "create one first" } } };
  assert.equal(planRuns([noSlug], { taskIds: [], toolIds: ["valendata"], runs: 1 }, ready).skipped[0].why, "create one first");
});

test("the estimate is shown per tool before any spend", () => {
  const { planned } = planRuns([task], { taskIds: [], toolIds: ["valendata", "browser_use"], runs: 5 }, ready);
  const cost = estimate(planned, pricing);
  assert.equal(cost.credits, 20);
  assert.equal(Math.round(cost.usd * 100), 35);
});

test("a Valendata run is timed from request to rows and priced from the credits it charged", async () => {
  const { now, sleep } = clock();
  const calls = [];
  const states = [{ status: "running" }, { status: "success", rows: [{ headline: "A", link: "u" }, { headline: "B", link: "v" }, { headline: "C", link: "w" }], credits_charged: 2 }];
  const fetchImpl = async (url, init) => {
    calls.push([init.method, String(url)]);
    const body = init.method === "POST" ? { run_id: "r1", status: "running" } : states.shift();
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const keys = { valendata: { apiKey: "k", apiUrl: "https://api.test" } };
  const out = await runValendata({ task, config: task.tools.valendata, keys, pricing, fetchImpl, now, sleep });
  assert.equal(out.ok, true);
  assert.equal(out.output.length, 2, "rows are cut to the task's limit");
  assert.equal(out.usd, 0.02);
  assert.equal(out.seconds, 1);
  assert.deepEqual(calls[0], ["POST", "https://api.test/v1/skills/wikipedia-current-events/runs"]);
});

test("an Apify run reports the dollars Apify billed", async () => {
  const { now, sleep } = clock();
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.endsWith("/runs")) return new Response(JSON.stringify({ data: { id: "a1", status: "RUNNING" } }));
    if (u.includes("/actor-runs/")) return new Response(JSON.stringify({ data: { id: "a1", status: "SUCCEEDED", defaultDatasetId: "d1", usageTotalUsd: 0.031 } }));
    return new Response(JSON.stringify([{ name: "Dr A", phone: "1" }]));
  };
  const out = await runApify({ task, config: { actor: "compass~crawler-google-places", input: {} }, keys: { apify: "t" }, fetchImpl, now, sleep });
  assert.equal(out.ok, true);
  assert.equal(out.usd, 0.031);
  assert.equal(out.output.length, 1);
});

test("browser-use's result is its last JSON line, whatever it logged before", () => {
  assert.deepEqual(lastJsonLine('INFO step 1\n{"seconds": 40.5, "ok": true}\n'), { seconds: 40.5, ok: true });
  assert.equal(lastJsonLine("crashed\n"), null);
});

test("the report gives medians and says whether every run gave the same answer", () => {
  const item = { task, tool: "valendata" };
  const rowsA = [{ headline: "A", link: "u" }];
  const lines = [
    resultLine({ ...item, attempt: 1 }, { ok: true, seconds: 1, usd: 0.02, output: rowsA }, "t"),
    resultLine({ ...item, attempt: 2 }, { ok: true, seconds: 3, usd: 0.02, output: rowsA }, "t"),
    resultLine({ ...item, tool: "browser_use", attempt: 1 }, { ok: true, seconds: 50, usd: 0.03, tokens: 9000, output: rowsA }, "t"),
    resultLine({ ...item, tool: "browser_use", attempt: 2 }, { ok: true, seconds: 70, usd: 0.04, tokens: 12000, output: [{ headline: "Z", link: "u" }] }, "t"),
  ];
  const [vd, bu] = summarise(lines);
  assert.equal(vd.median_seconds, 2);
  assert.equal(vd.same_answer_every_run, true);
  assert.equal(bu.same_answer_every_run, false);
  assert.equal(median([3, 1, 2]), 2);
  assert.match(markdown([vd, bu]), /\| wikipedia \| browser_use \| 2\/2 \| 60\.0 s/);
});

test("browser-use is priced from its own tokens once the prices are filled in", async () => {
  const { usdFromTokens } = await import("../tools/browser_use.mjs");
  const run = { input_tokens: 1_000_000, cached_tokens: 2_000_000, output_tokens: 100_000 };
  assert.equal(usdFromTokens(run, { input: null, cached_input: null, output: null }), null);
  assert.equal(usdFromTokens(run, { input: 0.3, cached_input: 0.03, output: 1.2 }), 0.3 + 0.06 + 0.12);
});

test("a tool's own field names are scored as the task's, and tools take turns run by run", async () => {
  const { inTaskFields } = await import("../run.mjs");
  const rows = inTaskFields([{ event_text: "A", article_url: "u", topic: "x" }], { headline: "event_text", link: "article_url" });
  assert.deepEqual(rows, [{ headline: "A", link: "u" }]);
  const { planned } = planRuns([task], { taskIds: [], toolIds: ["valendata", "browser_use"], runs: 2 }, ready);
  assert.deepEqual(planned.map((p) => `${p.tool}#${p.attempt}`), ["valendata#1", "browser_use#1", "valendata#2", "browser_use#2"]);
});

test("Valendata's AI use is reported as it was, never as a made-up zero", async () => {
  const { usedAi } = await import("../tools/valendata.mjs");
  assert.equal(usedAi({ scrape_mode_used: "deep" }), true);
  assert.equal(usedAi({ diagnosis: { per_field: { a: { where_tried: ["an AI read of the page"] } } } }), true);
  assert.equal(usedAi({ scrape_mode_used: "fast", diagnosis: {} }), false);
  const line = resultLine({ task, tool: "valendata", attempt: 1 }, { ok: true, seconds: 30, usd: 0.02, output: [{ headline: "A", link: "u" }], tokens: null, ai_used: true }, "t");
  assert.equal(line.tokens, null);
  assert.match(markdown(summarise([line])), /not reported \(AI read the page\)/);
});

test("a skill that never passed its own validation is refused before anything is spent", async () => {
  const { requireValidated } = await import("../tools/valendata.mjs");
  const fetchImpl = async () => new Response(JSON.stringify({ validation_status: "failed", validation_reason: "twin fields" }));
  await assert.rejects(requireValidated({ apiKey: "k", apiUrl: "https://api.test" }, "wiki", fetchImpl), /has not passed its own validation/);
});

test("a row counts as correct only when its text is really on the page", async () => {
  const { correctShare, pageText } = await import("../lib/truth.mjs");
  const page = pageText('<ul><li><a href="/g">Gaza genocide</a> – Israel launches an airstrike against a tent in <a>Khan Yunis</a>, Gaza Strip.</li></ul>');
  const real = { headline: "Israel launches an airstrike against a tent in Khan Yunis, Gaza Strip." };
  const madeUp = { headline: "Israel announces a ceasefire across the whole Gaza Strip today." };
  const category = { headline: "Armed conflicts and attacks" };
  assert.equal(correctShare([real], "headline", page), 1);
  assert.equal(correctShare([real, madeUp, category], "headline", page), 1 / 3);
});
