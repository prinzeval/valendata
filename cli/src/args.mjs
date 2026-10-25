// The command line as { command, rest, flags, inputs }:
//   valendata run google-maps-places-scraper search_query=dentist "location=Austin, TX" --max 10
// key=value words are the skill's inputs (what a coding agent writes most naturally); --flag value
// and --flag=value are options; a bare --flag is true.

const BOOLEAN_FLAGS = new Set(["json", "csv", "help", "no-wait", "full"]);

export function parseArgs(argv) {
  const [command = "help", ...words] = argv;
  const rest = [];
  const flags = {};
  const inputs = {};
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word.startsWith("--")) {
      const body = word.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) flags[body.slice(0, eq)] = body.slice(eq + 1);
      else if (BOOLEAN_FLAGS.has(body) || i + 1 >= words.length || words[i + 1].startsWith("--")) flags[body] = true;
      else flags[body] = words[(i += 1)];
    } else if (/^[A-Za-z_][\w.-]*=/.test(word)) {
      const eq = word.indexOf("=");
      inputs[word.slice(0, eq)] = typedValue(word.slice(eq + 1));
    } else {
      rest.push(word);
    }
  }
  return { command, rest, flags, inputs };
}

/** "10" → 10, "true" → true; everything else stays text (a ZIP code "02134" stays text). */
export function typedValue(text) {
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

/** A flag as a whole number, or undefined when absent; a bad value is an error, not a guess. */
export function intFlag(flags, name) {
  if (flags[name] === undefined) return undefined;
  const n = Number(flags[name]);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} needs a whole number, got "${flags[name]}"`);
  return n;
}
