import { createInterface } from "node:readline/promises";
import { request } from "../http.mjs";
import { saveApiKey } from "../config.mjs";
import { printJson } from "../output.mjs";

/** valendata login [--key vd_sk_...] — saves the key for later commands (file mode 600). */
export async function login(ctx) {
  let key = ctx.args.flags.key;
  if (!key || key === true) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    key = (await rl.question("Paste your Valendata API key (Settings → API Keys): ")).trim();
    rl.close();
  }
  if (!/^vd_sk_\S+$/.test(String(key))) throw new Error("That doesn't look like a Valendata API key (it starts with vd_sk_).");
  const settings = { ...ctx.settings, apiKey: key };
  const account = await request(settings, "GET", "/v1/account", { fetchImpl: ctx.fetch });
  const path = await saveApiKey(key, ctx.env);
  ctx.err(`Signed in. ${account.credits ?? "?"} credits on the ${account.plan ?? "free"} plan. Key saved to ${path}\n`);
}

/** valendata whoami — credits and plan. */
export async function whoami(ctx) {
  const account = await request(ctx.settings, "GET", "/v1/account", { fetchImpl: ctx.fetch });
  printJson({ credits: account.credits, plan: account.plan, cloud_browser: account.cloud_browser }, ctx.out);
}
