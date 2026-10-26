// Every key the benchmark uses, read from the environment (Valendata's also from the CLI's saved
// login). Keys are only ever passed to their own provider; nothing here prints one.

import { resolveSettings } from "../../cli/src/config.mjs";

export async function loadKeys(env = process.env) {
  const valendata = await resolveSettings(env);
  return {
    valendata,
    firecrawl: env.FIRECRAWL_API_KEY || null,
    apify: env.APIFY_TOKEN || env.APIFY_API_TOKEN || null,
    deepseek: env.DEEPSEEK_API_KEY || null,
  };
}

/** Which tools can run, as plain words for the plan (never the keys themselves). */
export function readiness(keys) {
  return {
    valendata: keys.valendata.apiKey ? "ready" : "needs a Valendata API key (valendata login)",
    firecrawl: keys.firecrawl ? "ready" : "needs FIRECRAWL_API_KEY",
    apify: keys.apify ? "ready" : "needs APIFY_TOKEN",
    browser_use: keys.deepseek ? "ready" : "needs DEEPSEEK_API_KEY",
  };
}
