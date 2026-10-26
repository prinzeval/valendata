// One browser-use run, in browser-use's own Python environment (BROWSER_USE_DIR, default
// ~/Desktop/browser-use). The agent script prints one JSON line; that line is the result.

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "agents", "browser_use_task.py");

export function lastJsonLine(text) {
  const lines = String(text).trim().split("\n").reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && "seconds" in parsed) return parsed;
    } catch {
      // not the result line
    }
  }
  return null;
}

/** Dollars from the tokens the run used, at the per-million prices in pricing.json (null when unset). */
export function usdFromTokens(result, prices) {
  if (!prices || prices.input == null || prices.cached_input == null || prices.output == null) return null;
  return ((result.input_tokens || 0) * prices.input + (result.cached_tokens || 0) * prices.cached_input +
    (result.output_tokens || 0) * prices.output) / 1e6;
}

export async function runBrowserUse({ task, keys, pricing, env = process.env, spawnImpl = spawn }) {
  const project = env.BROWSER_USE_DIR || join(homedir(), "Desktop", "browser-use");
  const settings = pricing.browser_use;
  const child = spawnImpl("uv", ["run", "--project", project, "python", SCRIPT, JSON.stringify({ ...task, model: settings.model })], {
    env: { ...env, DEEPSEEK_API_KEY: keys.deepseek, ANONYMIZED_TELEMETRY: "false" },
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk) => (out += chunk));
  child.stderr.on("data", (chunk) => (err += chunk));
  const code = await new Promise((resolve) => child.on("close", resolve));
  const result = lastJsonLine(out);
  if (!result) {
    return { ok: false, status: `exit ${code}`, seconds: 0, output: [], usd: 0, tokens: 0, error: err.trim().split("\n").slice(-3).join(" ") };
  }
  const usd = usdFromTokens(result, settings.usd_per_million_tokens);
  return {
    ...result,
    status: result.ok ? "done" : "not done",
    usd: usd ?? settings.estimate_usd_per_run,
    usd_is_estimate: usd === null,
    spent: { steps: result.steps, input_tokens: result.input_tokens, cached_tokens: result.cached_tokens, output_tokens: result.output_tokens },
  };
}
