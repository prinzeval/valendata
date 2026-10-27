// One request to the Valendata API. An error answer becomes an Error whose message is the
// server's own words (and what to do), never a stack of HTTP noise.

import { randomUUID } from "node:crypto";

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// The two browser refusals (409), in words that say which --browser to try instead.
const BROWSER_REFUSALS = {
  cloud_browser_paused:
    "The cloud browser is paused — try --browser extension (needs Chrome with the Valendata extension open) or leave it on auto.",
  extension_not_connected:
    "Your Chrome with the Valendata extension isn't connected — open Chrome with the extension and try again, or use --browser cloud.",
};

function messageOf(status, body) {
  const detail = body?.detail ?? body?.error ?? body;
  const text = typeof detail === "string" ? detail : detail?.message || detail?.error || JSON.stringify(detail);
  if (status === 401) return "Your API key was refused. Make one in Valendata under Settings → API Keys, then run `valendata login`.";
  if (status === 402) return `Not enough credits: ${text}`;
  const refusal = BROWSER_REFUSALS[body?.code ?? detail?.code];
  if (refusal) return /nothing was charged/i.test(text) ? `${refusal} Nothing was charged.` : refusal;
  return `${status}: ${text}`;
}

export async function request(settings, method, path, { body, query, idempotent = false, fetchImpl = fetch } = {}) {
  if (!settings.apiKey) {
    throw new ApiError(0, "No API key. Set VALENDATA_API_KEY, or run `valendata login` (make a key in Valendata under Settings → API Keys).");
  }
  const url = new URL(settings.apiUrl + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const headers = { Authorization: `Bearer ${settings.apiKey}`, "User-Agent": "valendata-cli" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // A retried run never starts a second paid run.
  if (idempotent) headers["Idempotency-Key"] = randomUUID();
  const response = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) throw new ApiError(response.status, messageOf(response.status, parsed), parsed);
  return parsed;
}
