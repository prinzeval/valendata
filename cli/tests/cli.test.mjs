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

// --browser: which browser a run, schedule, creation or saved setting uses.

const RUN_DONE = { status: "success", count: 1, credits_charged: 0.5, rows: [{ title: "A", phone: "1" }],
  browser_used: "extension", browser_note: "Ran on your Chrome." };

test("run --browser maps cloud to remote, sends extension as it is, and sends nothing for auto", async () => {
  const routes = { "POST /v1/skills/maps/runs": [202, { run_id: "r", status: "queued" }], "GET /v1/runs/r": [200, RUN_DONE] };
  for (const [word, sent] of [["cloud", "remote"], ["extension", "extension"], ["auto", undefined], ["CLOUD", "remote"]]) {
    const { code, calls } = await runCli(["run", "maps", "q=x", "--browser", word], routes);
    assert.equal(code, 0);
    assert.equal(calls[0].body.browser_type, sent, word);
    assert.deepEqual(calls[0].body.inputs, { q: "x" }, "browser_type is a run setting, not an input");
  }
  const { calls } = await runCli(["run", "maps"], routes);
  assert.ok(!("browser_type" in calls[0].body), "no --browser, no browser_type");
});

test("a --browser that is not auto, cloud or extension is refused before anything runs", async () => {
  for (const argv of [["run", "maps", "--browser", "chrome"], ["run", "maps", "--browser"], ["workflow", "w", "--browser=remote"],
    ["schedule", "maps", "--every", "daily", "--browser", "none"], ["update", "maps", "--browser", "firefox"]]) {
    const { code, err, calls } = await runCli(argv, {});
    assert.equal(code, 1, argv.join(" "));
    assert.match(err, /--browser needs auto, cloud or extension/);
    assert.equal(calls.length, 0, "no request was sent");
  }
});

test("run says where it ran, and --json carries browser_used with the rows", async () => {
  const routes = { "POST /v1/skills/maps/runs": [202, { run_id: "r" }], "GET /v1/runs/r": [200, RUN_DONE] };
  const plain = await runCli(["run", "maps"], routes);
  assert.match(plain.err, /success: 1 rows, 0\.5 credits\. Ran on your Chrome\./);
  assert.deepEqual(JSON.parse(plain.out), RUN_DONE.rows, "the default output stays the rows");
  const json = await runCli(["run", "maps", "--json", "--fields", "title"], routes);
  assert.deepEqual(JSON.parse(json.out), {
    run_id: "r", status: "success", count: 1, credits_charged: 0.5, browser_used: "extension",
    browser_note: "Ran on your Chrome.", rows: [{ title: "A" }],
  });
});

const PAUSED_DETAIL = "The cloud browser is unavailable right now: its proxy is rejecting our login. Nothing ran and nothing was charged.";
const PAUSED_GUIDANCE = "The cloud browser is unavailable, so nothing ran and nothing was charged. To run it on your own Chrome instead "
  + "(it uses your Chrome's sign-ins, which may be a different account), run the same command again with --browser extension.";

test("a paused cloud browser prints the server's reason and the ask-first line, and never retries on Chrome", async () => {
  const refused = [409, { detail: PAUSED_DETAIL, code: "cloud_browser_paused", type: "conflict" }];
  for (const [argv, route] of [
    [["run", "maps", "q=x"], "POST /v1/skills/maps/runs"],
    [["run", "maps", "--browser", "cloud"], "POST /v1/skills/maps/runs"],
    [["workflow", "w"], "POST /v1/workflows/w/run"],
  ]) {
    const { code, out, err, calls } = await runCli(argv, { [route]: refused });
    assert.equal(code, 1, argv.join(" "));
    assert.equal(out, "", "no rows");
    assert.ok(err.endsWith(`Error: ${PAUSED_DETAIL}\n${PAUSED_GUIDANCE}\n`), err);
    assert.equal(calls.length, 1, "one request: no retry on another browser");
    assert.ok(calls.every((c) => c.body?.browser_type !== "extension" && c.body?.browser !== "extension"), "never switches to Chrome");
  }
  const bare = await runCli(["run", "maps"], { "POST /v1/skills/maps/runs": [409, { code: "cloud_browser_paused" }] });
  assert.equal(bare.err, `Error: ${PAUSED_GUIDANCE}\n`, "without the server's words, the guidance alone");
});

test("a Chrome that isn't connected says what to do", async () => {
  const chrome = await runCli(["workflow", "w", "--browser", "extension"], {
    "POST /v1/workflows/w/run": [409, { detail: "Your Chrome … is not connected.", code: "extension_not_connected", type: "conflict" }],
  });
  assert.equal(chrome.code, 1);
  assert.equal(chrome.err.split("\n").at(-2), "Error: Your Chrome with the Valendata extension isn't connected — open Chrome with the extension and try again, or use --browser cloud.");
  const other = await runCli(["run", "maps"], { "POST /v1/skills/maps/runs": [409, { detail: "busy", code: "idempotency_key_in_use" }] });
  assert.match(other.err, /409: busy/, "other conflicts keep the server's words");
});

test("workflow --browser sends browser_type and prints where it ran", async () => {
  const answer = { status: "success", outputs: { rows: [] }, browser_used: "cloud", browser_note: "Ran on the cloud browser." };
  const { code, out, err, calls } = await runCli(["workflow", "leads", "city=Austin", "--browser", "cloud"], { "POST /v1/workflows/leads/run": [200, answer] });
  assert.equal(code, 0);
  assert.deepEqual(calls[0].body, { inputs: { city: "Austin" }, wait: true, browser_type: "remote" });
  assert.equal(JSON.parse(out).browser_used, "cloud");
  assert.match(err, /Ran on the cloud browser\./);
  const auto = await runCli(["workflow", "leads", "--browser", "auto"], { "POST /v1/workflows/leads/run": [200, { status: "success" }] });
  assert.deepEqual(auto.calls[0].body, { inputs: {}, wait: true });
});

test("schedule sends the cadence, inputs and browser; --workflow schedules a workflow", async () => {
  const skill = await runCli(["schedule", "maps", "q=dentist", "--every", "daily 09:00", "--timezone", "Europe/London", "--max", "50", "--browser", "extension"], {
    "POST /v1/skills/maps/schedules": [201, { id: "sklsch_1", browser_type: "extension" }],
  });
  assert.equal(skill.code, 0);
  assert.deepEqual(skill.calls[0].body, { every: "daily 09:00", inputs: { q: "dentist" }, browser_type: "extension", timezone: "Europe/London", max_results: 50 });
  assert.equal(JSON.parse(skill.out).browser_type, "extension");
  const flow = await runCli(["schedule", "--workflow", "leads", "--cron", "0 9 * * 1-5", "--browser", "auto"], {
    "POST /v1/workflows/leads/schedules": [201, { id: "wfsch_1", browser_type: null }],
  });
  assert.equal(flow.code, 0);
  assert.deepEqual(flow.calls[0].body, { cron: "0 9 * * 1-5", inputs: {} });
  const none = await runCli(["schedule", "maps"], {});
  assert.equal(none.code, 1);
  assert.match(none.err, /Missing how often: --every/);
});

test("schedule-update changes only what is given; --browser auto goes back to automatic", async () => {
  const route = { "PATCH /v1/schedules/sklsch_1": [200, { id: "sklsch_1", browser_type: null }] };
  const auto = await runCli(["schedule-update", "sklsch_1", "--browser", "auto"], route);
  assert.equal(auto.code, 0);
  assert.deepEqual(auto.calls[0].body, { browser_type: "auto" });
  const cloud = await runCli(["schedule-update", "sklsch_1", "--browser", "cloud", "--every", "2h"], route);
  assert.deepEqual(cloud.calls[0].body, { every: "2h", browser_type: "remote" });
  const nothing = await runCli(["schedule-update", "sklsch_1"], route);
  assert.equal(nothing.code, 1);
  assert.match(nothing.err, /Nothing to change/);
  assert.equal(nothing.calls.length, 0);
});

test("schedules lists each one's browser in the --browser words", async () => {
  const { out, calls } = await runCli(["schedules", "--kind", "skill"], {
    "GET /v1/schedules": [200, { schedules: [
      { id: "sklsch_1", kind: "skill", skill_slug: "maps", every: "daily 09:00", timezone: "UTC", enabled: true, browser_type: "remote" },
      { id: "wfsch_2", kind: "workflow", workflow_slug: "leads", cron: "0 9 * * 1", timezone: "UTC", enabled: true, browser_type: null },
    ] }],
  });
  assert.equal(calls[0].url.searchParams.get("kind"), "skill");
  assert.deepEqual(JSON.parse(out).map((s) => [s.slug, s.browser]), [["maps", "cloud"], ["leads", "auto"]]);
});

test("update saves a skill's or workflow's browser; auto is sent so the saved choice is cleared", async () => {
  const skill = await runCli(["update", "maps", "--browser", "cloud"], { "PATCH /v1/skills/maps": [200, { slug: "maps" }] });
  assert.equal(skill.code, 0);
  assert.deepEqual(skill.calls[0].body, { browser_type: "remote" });
  assert.deepEqual(JSON.parse(skill.out), { slug: "maps", kind: "skill", browser: "cloud" });
  const flow = await runCli(["update", "--workflow", "leads", "--browser", "auto"], { "PATCH /v1/workflows/leads": [200, { slug: "leads" }] });
  assert.deepEqual(flow.calls[0].body, { browser_type: "auto" });
  const nothing = await runCli(["update", "maps"], {});
  assert.equal(nothing.code, 1);
  assert.match(nothing.err, /Nothing to change: give --browser/);
});

test("create sends browser (not browser_type), waits, and prints the new slug", async () => {
  let reads = 0;
  const routes = {
    "POST /v1/skills": [202, { creation_id: "cr_1", status: "queued" }],
    "GET /v1/skill-creations/cr_1": () => (reads++ === 0
      ? [200, { status: "recording", progress: "Step 2: type the search" }]
      : [200, { status: "ready", slug: "dentists-austin", name: "Dentists", browser: "extension", source: "browser", credits_charged: 12 }]),
  };
  const { code, out, err, calls } = await runCli(
    ["create", "List", "dentists", "in", "Austin", "--url", "https://maps.example", "city=Austin", "--fields", "name,phone", "--browser", "extension"], routes);
  assert.equal(code, 0);
  assert.deepEqual(calls[0].body, {
    task: "List dentists in Austin", start_url: "https://maps.example", browser: "extension",
    inputs: { city: "Austin" }, output_fields: ["name", "phone"],
  });
  assert.ok(calls[0].init.headers["Idempotency-Key"]);
  assert.match(err, /Step 2: type the search/);
  assert.match(err, /valendata run dentists-austin/);
  assert.equal(JSON.parse(out).slug, "dentists-austin");
  const auto = await runCli(["create", "List", "x", "--url", "https://x.example", "--browser", "auto", "--no-wait"], routes);
  assert.ok(!("browser" in auto.calls[0].body), "auto is the default: nothing sent");
  assert.deepEqual(JSON.parse(auto.out), { creation_id: "cr_1", status: "queued" });
  const noUrl = await runCli(["create", "List", "x"], routes);
  assert.equal(noUrl.code, 1);
  assert.match(noUrl.err, /Missing --url/);
});
