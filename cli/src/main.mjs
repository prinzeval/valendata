import { parseArgs } from "./args.mjs";
import { resolveSettings } from "./config.mjs";
import { login, whoami } from "./commands/account.mjs";
import { search, skills, info, clone, run, runs, cancel } from "./commands/skills.mjs";
import { scrape, map, webSearch, crawl } from "./commands/web.mjs";
import { workflows, workflow } from "./commands/workflows.mjs";

export const HELP = `valendata — websites as APIs, from your terminal (https://valendata.com)

Set up:
  valendata login [--key vd_sk_...]     save your API key (or set VALENDATA_API_KEY)
  valendata whoami                       credits and plan

Skills (saved website tasks that return the same rows every time and repair themselves):
  valendata search <task words>          find a skill (marketplace + yours)   [--site x.com] [--limit 5]
  valendata clone <slug>                 copy a public skill to your account (free)
  valendata info <slug>                  its inputs, output fields and price
  valendata run <slug> key=value ...     run it and print the rows            [--max 20] [--fields a,b] [--csv]
                                                                              [--no-wait] [--wait-seconds 900] [--full]
  valendata runs <run_id>                a run's status and rows
  valendata cancel <run_id>              stop a run
  valendata skills                       your skills                          [--q words]

Pages, sites and search (Firecrawl-compatible):
  valendata scrape <url>                 one page as Markdown                 [--formats markdown,links,html,summary] [--json]
  valendata map <url>                    a site's page addresses              [--limit 200] [--search words]
  valendata web-search <query>           web results                          [--limit 5]
  valendata crawl <url>                  a site's pages as Markdown           [--limit 10]

Workflows:
  valendata workflows                    your workflows
  valendata workflow <slug> key=value    run one and wait for its result

Every run spends credits from your account. Output is JSON (rows as a list); --csv for rows.
Example:
  valendata run google-maps-places-scraper search_query=dentist "location=Austin, TX" --max 10 --fields title,phone,website
`;

const COMMANDS = {
  login, whoami, search, skills, info, clone, run, runs, cancel, scrape, map, "web-search": webSearch, crawl, workflows, workflow,
};

/** Runs one command line. Returns the exit code; never throws. */
export async function main(argv, { env = process.env, fetchImpl = fetch, out, err, sleep } = {}) {
  const write = out || ((s) => process.stdout.write(s));
  const warn = err || ((s) => process.stderr.write(s));
  const args = parseArgs(argv);
  if (args.command === "help" || args.command === "--help" || args.command === "-h" || args.flags.help) {
    write(HELP);
    return 0;
  }
  if (args.command === "--version" || args.command === "version") {
    write("0.1.0\n");
    return 0;
  }
  const handler = COMMANDS[args.command];
  if (!handler) {
    warn(`Unknown command "${args.command}". Run \`valendata help\`.\n`);
    return 2;
  }
  try {
    const settings = await resolveSettings(env);
    await handler({ args, settings, env, fetch: fetchImpl, out: write, err: warn, sleep });
    return 0;
  } catch (error) {
    warn(`Error: ${error.message}\n`);
    return 1;
  }
}
