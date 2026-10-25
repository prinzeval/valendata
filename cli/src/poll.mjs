// Wait for a run that runs in the background: ask every few seconds until it ends, with one
// ceiling so a command never hangs forever. A run past the ceiling keeps running on Valendata;
// its id is printed so `valendata runs <id>` reads it later.

export const DONE = new Set(["success", "partial", "failed", "cancelled", "completed", "error"]);

export async function pollUntilDone(read, { everyMs = 4000, maxMs = 15 * 60 * 1000, sleep, now = Date.now } = {}) {
  const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const started = now();
  for (;;) {
    const state = await read();
    if (DONE.has(String(state?.status || "").toLowerCase())) return { state, done: true };
    if (now() - started >= maxMs) return { state, done: false };
    await wait(everyMs);
  }
}
