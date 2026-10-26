// The CLI against a fake Valendata API: every command's request and printout, no credits spent.

import assert from "node:assert/strict";
import test from "node:test";
import { main } from "../src/main.mjs";
import { parseArgs, typedValue } from "../src/args.mjs";
import { toCsv } from "../src/output.mjs";

const ENV = { VALENDATA_API_KEY: "vd_sk_test", VALENDATA_API_URL: "https://api.example", XDG_CONFIG_HOME: "/nonexistent" };

function fakeApi(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const key = `${init.method} ${u.pathname}`;
    calls.push({ key, url: u, init, body: init.body ? JSON.parse(init.body) : undefined });
    const handler = routes[key];
    if (!handler) return new Response(JSON.stringify({ detail: `no route ${key}` }), { status: 404 });
    const [status, body] = typeof handler === "function" ? handler(calls.at(-1)) : handler;
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

async function runCli(argv, routes) {
  const api = fakeApi(routes);
  let out = "";
  let err = "";
  const code = await main(argv, { env: ENV, fetchImpl: api.fetchImpl, out: (s) => (out += s), err: (s) => (err += s), sleep: async () => {} });
  return { code, out, err, calls: api.calls };
}

test("key=value words are inputs, --flags are options, numbers are typed but ZIP codes stay text", () => {
  const a = parseArgs(["run", "maps", "search_query=dentist", "location=Austin, TX", "zip=02134", "count=10", "--max", "5", "--csv"]);
  assert.equal(a.command, "run");
  assert.deepEqual(a.rest, ["maps"]);
  assert.deepEqual(a.inputs, { search_query: "dentist", location: "Austin, TX", zip: "02134", count: 10 });
  assert.deepEqual(a.flags, { max: "5", csv: true });
  assert.equal(typedValue("true"), true);
});

test("run starts a background run with an idempotency key, waits, and prints the rows", async () => {
  let reads = 0;
  const { code, out, calls } = await runCli(["run", "maps", "search_query=dentist", "--max", "2", "--fields", "title"], {
    "POST /v1/skills/maps/runs": [202, { run_id: "run_1", status: "queued" }],
    "GET /v1/runs/run_1": () => (reads++ === 0
      ? [200, { status: "running" }]
      : [200, { status: "success", count: 2, credits_charged: 1.2, rows: [{ title: "A", phone: "1" }, { title: "B", phone: "2" }] }]),
  });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out), [{ title: "A" }, { title: "B" }]);
  const start = calls[0];
  assert.deepEqual(start.body, { inputs: { search_query: "dentist" }, max_results: 2 });
  assert.ok(start.init.headers["Idempotency-Key"]);
  assert.equal(start.init.headers.Authorization, "Bearer vd_sk_test");
});

test("a failed run exits 1 with its reason", async () => {
  const { code, err } = await runCli(["run", "maps"], {
    "POST /v1/skills/maps/runs": [202, { run_id: "run_2" }],
    "GET /v1/runs/run_2": [200, { status: "failed", error: "Site blocked us" }],
  });
  assert.equal(code, 1);
  assert.match(err, /run_2 failed: Site blocked us/);
});

test("--no-wait prints the run id and returns", async () => {
  const { out } = await runCli(["run", "maps", "--no-wait"], { "POST /v1/skills/maps/runs": [202, { run_id: "run_3", status: "queued" }] });
  assert.deepEqual(JSON.parse(out), { run_id: "run_3", status: "queued" });
});

test("search shows slugs, inputs (required starred), price and success rate", async () => {
  const { out, calls } = await runCli(["search", "google", "maps", "dentists"], {
    "GET /v1/marketplace/search": [200, { results: [{ slug: "maps", name: "Maps", inputs: [{ name: "q", required: true }], price: { estimate_credits: 2 }, health: { success_rate_20: 1 } }] }],
  });
  assert.equal(calls[0].url.searchParams.get("q"), "google maps dentists");
  assert.deepEqual(JSON.parse(out)[0], { slug: "maps", name: "Maps", inputs: ["q*"], price_credits: 2, success_rate: 1 });
});

test("scrape prints the Markdown itself by default", async () => {
  const { out, calls } = await runCli(["scrape", "https://example.com"], {
    "POST /v2/scrape": [200, { success: true, data: { markdown: "# Example" } }],
  });
  assert.equal(out, "# Example\n");
  assert.deepEqual(calls[0].body, { url: "https://example.com", formats: ["markdown"], onlyMainContent: true });
});

test("a refused key says how to fix it", async () => {
  const { code, err } = await runCli(["whoami"], { "GET /v1/account": [401, { detail: "bad key" }] });
  assert.equal(code, 1);
  assert.match(err, /Settings → API Keys/);
});

test("rows print as CSV with quoting", () => {
  assert.equal(toCsv([{ a: 'x,"y"', b: 1 }, { a: "z" }]), 'a,b\n"x,""y""",1\nz,');
});

test("login says the balance and plan in words, whatever shape the account answer has", async () => {
  const { login } = await import("../src/commands/account.mjs");
  const said = [];
  const fetch = async () => new Response(JSON.stringify({ credits: { balance: "17153.94" }, plan: { name: "free" } }));
  const env = { XDG_CONFIG_HOME: (await import("node:fs")).mkdtempSync((await import("node:os")).tmpdir() + "/vd-") };
  await login({ args: { flags: { key: "vd_sk_test" } }, settings: { apiUrl: "https://api.test" }, fetch, env, err: (s) => said.push(s) });
  assert.match(said[0], /Signed in\. 17153\.94 credits on the free plan\./);
});
