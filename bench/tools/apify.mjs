// One Apify actor run (the market leader's own actor for the site): start, wait, read the dataset.
// Cost is the run's own usageTotalUsd, as Apify bills it.

const BASE = "https://api.apify.com/v2";

async function call(fetchImpl, token, method, path, body) {
  const response = await fetchImpl(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Apify ${response.status}: ${json.error?.message || "request failed"}`);
  return json;
}

export async function runApify({ task, config, keys, fetchImpl = fetch, sleep, now = Date.now }) {
  const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const started = now();
  let { data: run } = await call(fetchImpl, keys.apify, "POST", `/acts/${config.actor}/runs`, config.input);
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status) && now() - started < 10 * 60 * 1000) {
    await wait(2000);
    ({ data: run } = await call(fetchImpl, keys.apify, "GET", `/actor-runs/${run.id}`));
  }
  const items = run.status === "SUCCEEDED"
    ? await call(fetchImpl, keys.apify, "GET", `/datasets/${run.defaultDatasetId}/items?clean=true&limit=${task.limit}`)
    : [];
  return {
    ok: run.status === "SUCCEEDED",
    status: run.status,
    seconds: (now() - started) / 1000,
    output: items,
    usd: Number(run.usageTotalUsd ?? 0),
    spent: { usd: Number(run.usageTotalUsd ?? 0) },
    tokens: 0,
    ref: run.id,
    error: run.status === "SUCCEEDED" ? null : run.statusMessage || null,
  };
}
