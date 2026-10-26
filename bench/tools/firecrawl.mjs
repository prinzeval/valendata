// Firecrawl's AI extraction, the way Firecrawl recommends it now: /v2/scrape with a JSON format
// (the prompt plus the asked-for fields as a schema). /v1/extract is deprecated and answers
// "Use /v2/scrape with formats including a 'json' format object".

const BASE = "https://api.firecrawl.dev/v2";

function schemaFor(task) {
  const item = { type: "object", properties: Object.fromEntries(task.fields.map((f) => [f, { type: "string" }])) };
  return { type: "object", properties: { items: { type: "array", items: item } }, required: ["items"] };
}

export async function runFirecrawl({ task, keys, pricing, fetchImpl = fetch, now = Date.now }) {
  const started = now();
  const response = await fetchImpl(`${BASE}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${keys.firecrawl}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: task.url,
      formats: [{ type: "json", prompt: task.prompt, schema: schemaFor(task) }],
      onlyMainContent: false,
    }),
  });
  const body = await response.json().catch(() => ({}));
  const seconds = (now() - started) / 1000;
  if (!response.ok || body.success === false) {
    return { ok: false, status: `http ${response.status}`, seconds, output: [], usd: 0, tokens: 0, error: body.error || "request failed" };
  }
  const meta = body.data?.metadata || {};
  const credits = Number(meta.creditsUsed ?? body.creditsUsed ?? 0);
  return {
    ok: true,
    status: "completed",
    seconds,
    output: body.data?.json?.items ?? body.data?.json ?? [],
    usd: pricing.firecrawl.estimate_usd_per_run,
    usd_is_estimate: true,
    spent: { firecrawl_credits: credits },
    tokens: 0,
    ref: meta.scrapeId || null,
    error: null,
  };
}
