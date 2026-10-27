import { request } from "../http.mjs";
import { intFlag, need } from "../args.mjs";
import { printJson } from "../output.mjs";
import { pollUntilDone } from "../poll.mjs";

const formatsOf = (flags, fallback) => String(flags.formats || fallback).split(",").map((f) => f.trim()).filter(Boolean);

/** valendata scrape <url> [--formats markdown,links,html,screenshot,summary] — one page (POST /v2/scrape). */
export async function scrape(ctx) {
  const url = need(ctx.args.rest[0], "a page address");
  const { flags } = ctx.args;
  const answer = await request(ctx.settings, "POST", "/v2/scrape", {
    body: { url, formats: formatsOf(flags, "markdown"), onlyMainContent: flags.full ? false : true }, fetchImpl: ctx.fetch,
  });
  const data = answer?.data ?? answer;
  if (!flags.json && formatsOf(flags, "markdown").join() === "markdown" && typeof data?.markdown === "string") {
    return ctx.out(data.markdown + "\n");
  }
  return printJson(data, ctx.out);
}

/** valendata map <url> [--limit 200] [--search words] — a site's page addresses (POST /v2/map). */
export async function map(ctx) {
  const url = need(ctx.args.rest[0], "a site address");
  const { flags } = ctx.args;
  const answer = await request(ctx.settings, "POST", "/v2/map", {
    body: { url, limit: intFlag(flags, "limit") ?? 200, search: flags.search }, fetchImpl: ctx.fetch,
  });
  printJson((answer?.links || []).map((l) => (typeof l === "string" ? l : l.url)), ctx.out);
}

/** valendata web-search <query> [--limit 5] — web results (POST /v2/search). */
export async function webSearch(ctx) {
  const query = need(ctx.args.rest.join(" "), "what to search for");
  const answer = await request(ctx.settings, "POST", "/v2/search", {
    body: { query, limit: intFlag(ctx.args.flags, "limit") ?? 5 }, fetchImpl: ctx.fetch,
  });
  const web = answer?.data?.web ?? answer?.data ?? [];
  printJson(web.map((r) => ({ title: r.title, url: r.url, description: r.description })), ctx.out);
}

/** valendata crawl <url> [--limit 10] — pages of a site as Markdown (POST /v2/crawl, then waits). */
export async function crawl(ctx) {
  const url = need(ctx.args.rest[0], "a site address");
  const started = await request(ctx.settings, "POST", "/v2/crawl", {
    body: { url, limit: intFlag(ctx.args.flags, "limit") ?? 10, scrapeOptions: { formats: ["markdown"], onlyMainContent: true } },
    fetchImpl: ctx.fetch,
  });
  ctx.err(`Crawling ${url} (crawl ${started.id})…\n`);
  const read = () => request(ctx.settings, "GET", `/v2/crawl/${encodeURIComponent(started.id)}`, { fetchImpl: ctx.fetch });
  const { state } = await pollUntilDone(read, { sleep: ctx.sleep, maxMs: (intFlag(ctx.args.flags, "wait-seconds") ?? 600) * 1000 });
  printJson((state?.data || []).map((d) => ({ url: d.metadata?.sourceURL || d.metadata?.url, markdown: d.markdown })), ctx.out);
}
