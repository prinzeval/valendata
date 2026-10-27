import { parseArgs } from "./args.mjs";
import { resolveSettings } from "./config.mjs";
import { login, whoami } from "./commands/account.mjs";
import { search, skills, info, clone, run, runs, cancel, create } from "./commands/skills.mjs";
import { scrape, map, webSearch, crawl } from "./commands/web.mjs";
import { workflows, workflow } from "./commands/workflows.mjs";
import { schedule, schedules, scheduleUpdate } from "./commands/schedules.mjs";
import { update } from "./commands/settings.mjs";

export const HELP = `valendata — websites as APIs, from your terminal (https://valendata.com)

Set up:
  valendata login [--key vd_sk_...]     save your API key (or set VALENDATA_API_KEY)
  valendata whoami                       credits and plan

Skills (saved website tasks that return the same rows every time and repair themselves):
  valendata search <task words>          find a skill (marketplace + yours)   [--site x.com] [--limit 5]
  valendata clone <slug>                 copy a public skill to your account (free)
  valendata info <slug>                  its inputs, output fields and price
  valendata run <slug> key=value ...     run it and print the rows            [--max 20] [--fields a,b] [--csv] [--json]
                                                                              [--no-wait] [--wait-seconds 900] [--full]
                                                                              [--browser auto|cloud|extension]
  valendata runs <run_id>                a run's status and rows
  valendata cancel <run_id>              stop a run
  valendata skills                       your skills                          [--q words]
  valendata create <task> --url <url>    build a new skill from a task        [--name x] [--fields a,b] [key=example ...]
                                                                              [--browser auto|cloud|extension] [--no-wait]
  valendata update <slug>                save the browser it runs on          --browser auto|cloud|extension [--workflow]

Pages, sites and search (Firecrawl-compatible):
  valendata scrape <url>                 one page as Markdown                 [--formats markdown,links,html,summary] [--json]
  valendata map <url>                    a site's page addresses              [--limit 200] [--search words]
  valendata web-search <query>           web results                          [--limit 5]
  valendata crawl <url>                  a site's pages as Markdown           [--limit 10]

Workflows:
  valendata workflows                    your workflows
  valendata workflow <slug> key=value    run one and wait for its result      [--browser auto|cloud|extension]

Schedules (every scheduled run spends credits):
  valendata schedule <slug> key=value    run it on a schedule                 --every "daily 09:00" | --cron "0 9 * * 1-5"
                                                                              [--timezone UTC] [--max 100] [--workflow]
                                                                              [--browser auto|cloud|extension]
  valendata schedules                    every schedule                       [--kind skill|workflow]
  valendata schedule-update <id>         change one (only what you give)      [--every ...|--cron ...] [--timezone x]
                                                                              [--max 100] [--browser auto|cloud|extension]

--browser: auto (default) lets Valendata pick; cloud is the cloud browser; extension is your own Chrome
with the Valendata extension (it must be open). Use extension for sites that block cloud browsers.

Every run spends credits from your account. Output is JSON (rows as a list); --csv for rows.
Example:
  valendata run google-maps-places-scraper search_query=dentist "location=Austin, TX" --max 10 --fields title,phone,website
`;

const COMMANDS = {
  login, whoami, search, skills, info, clone, run, runs, cancel, create, update, scrape, map, "web-search": webSearch, crawl,
  workflows, workflow, schedule, schedules, "schedule-update": scheduleUpdate,
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
