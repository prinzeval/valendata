// --browser auto|cloud|extension: which browser a run, schedule or creation uses.
//   auto       let Valendata pick (the skill's or step's own browser, and your Chrome when the
//              cloud browser is paused); a run or creation sends nothing, an update sends "auto"
//              so a saved choice goes back to automatic
//   cloud      the cloud browser ("remote" in browser_type bodies)
//   extension  your own Chrome with the Valendata extension (it must be open and connected)

export const BROWSERS = ["auto", "cloud", "extension"];

/** The --browser word, or undefined when absent; anything else is an error, not a guess. */
export function browserFlag(flags) {
  const value = flags.browser;
  if (value === undefined) return undefined;
  const word = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!BROWSERS.includes(word)) {
    throw new Error(`--browser needs auto, cloud or extension${typeof value === "string" ? `, got "${value}"` : ""}`);
  }
  return word;
}

/**
 * The body field for a run, schedule or saved setting: { browser_type } or {} when nothing is sent.
 * `clear`: a change to something saved (an update), where auto must be said to undo a saved choice.
 */
export function browserType(flags, { clear = false } = {}) {
  const word = browserFlag(flags);
  if (word === undefined || (word === "auto" && !clear)) return {};
  return { browser_type: word === "cloud" ? "remote" : word };
}

/** The body field for a skill creation, which speaks the same words: { browser } or {}. */
export function creationBrowser(flags) {
  const word = browserFlag(flags);
  return word === undefined || word === "auto" ? {} : { browser: word };
}

/** The line a person reads about where a run went, or "" when the answer does not say. */
export function browserLine(result) {
  if (result?.browser_note) return ` ${result.browser_note}`;
  if (result?.browser_used) return ` Browser: ${result.browser_used}.`;
  return "";
}
