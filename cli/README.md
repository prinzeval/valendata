# valendata (CLI)

Websites as APIs, from your terminal. Run Valendata skills — saved website tasks that return the same clean rows every time and repair themselves when a site changes — scrape and search the web, and run workflows.

Built for coding agents (Claude Code, Codex, Cursor) as much as for people: short commands, JSON output, no tool list to load.

```bash
export VALENDATA_API_KEY="vd_sk_..."      # Valendata → Settings → API Keys (or: npx valendata login)

npx valendata search "google maps dentists"
npx valendata clone google-maps-places-scraper
npx valendata run google-maps-places-scraper search_query=dentist "location=Austin, TX" --max 10 --fields title,phone,website
npx valendata scrape https://news.ycombinator.com
```

## Commands

| Command | What it does |
| --- | --- |
| `login [--key vd_sk_...]` | Save your API key (mode 600). `VALENDATA_API_KEY` wins when set. |
| `whoami` | Credits and plan. |
| `search <task words>` | Find a skill in the marketplace and your own (`--site`, `--limit`, `--kind workflow`). |
| `clone <slug>` | Copy a public skill to your account (free). Run the copy's slug. |
| `info <slug>` | A skill's inputs, output fields and price. |
| `run <slug> key=value …` | Run a skill and print its rows (`--max 20`, `--fields a,b`, `--csv`, `--json`, `--no-wait`, `--wait-seconds 900`, `--full`, `--browser`). `--json` prints the rows with the run's status, cost, `browser_used` and `browser_note`. |
| `runs <run_id>` | A run's status and rows. |
| `cancel <run_id>` | Stop a run. |
| `skills` | Your skills. |
| `create <task words> --url <start_url> [key=example …]` | Build a new skill and wait for it (`--name`, `--fields a,b` for its columns, `--browser`, `--no-wait`). Inputs are `key=value` with the example value the recording uses. |
| `update <slug> --browser auto\|cloud\|extension` | Save the browser a skill runs on when a run doesn't pick one; `--workflow` sets every browser step of a workflow. `auto` clears it. |
| `scrape <url>` | One page as Markdown (`--formats markdown,links,html,summary`, `--json`). |
| `map <url>` | A site's page addresses. |
| `web-search <query>` | Web results. |
| `crawl <url>` | A site's pages as Markdown (`--limit 10`). |
| `workflows` | Your workflows. |
| `workflow <slug> key=value …` | Run a workflow and wait for its result (`--browser`). |
| `schedule <slug> key=value …` | Run a skill on a schedule: `--every "daily 09:00"` or `--cron "0 9 * * 1-5"` (`--timezone`, `--max`, `--browser`; `--workflow` for a workflow). |
| `schedules` | Every schedule, with its id and browser (`--kind skill\|workflow`). |
| `schedule-update <schedule_id> [key=value …]` | Change only what you give (`--every`, `--cron`, `--timezone`, `--max`, `--browser`; inputs replace its inputs). |

## Which browser

`--browser auto|cloud|extension` picks where the browser opens for `run`, `workflow`, `create`, `schedule`, `schedule-update` and `update`. `auto`, the default, uses the skill's or step's own saved browser, else the cloud browser; it never switches between the two by itself. `cloud` is Valendata's cloud browser. `extension` is your own Chrome with the Valendata extension, which must be open; use it for sites that block cloud browsers. A workflow with `cloud` or `extension` runs every browser step there; leave a workflow that mixes both on `auto`.

```bash
npx valendata run google-maps-places-scraper search_query=dentist "location=Austin, TX" --browser extension
```

When the cloud browser is unavailable, or your Chrome isn't connected, a run stops before it starts (nothing is charged) and the error says why. The CLI never retries on the other browser by itself: to run on your own Chrome instead (it uses your Chrome's sign-ins, which may be a different account), run the same command again with `--browser extension`. A finished run says where it ran.

Skill inputs are `key=value` words; quote a value with spaces (`"location=Austin, TX"`). Every run spends credits from your account, and a retried run never starts a second paid run. `VALENDATA_API_URL` points the CLI at another server.

Node 18 or newer, no dependencies. MIT.
