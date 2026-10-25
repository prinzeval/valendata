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
| `run <slug> key=value …` | Run a skill and print its rows (`--max 20`, `--fields a,b`, `--csv`, `--no-wait`, `--wait-seconds 900`, `--full`). |
| `runs <run_id>` | A run's status and rows. |
| `cancel <run_id>` | Stop a run. |
| `skills` | Your skills. |
| `scrape <url>` | One page as Markdown (`--formats markdown,links,html,summary`, `--json`). |
| `map <url>` | A site's page addresses. |
| `web-search <query>` | Web results. |
| `crawl <url>` | A site's pages as Markdown (`--limit 10`). |
| `workflows` | Your workflows. |
| `workflow <slug> key=value …` | Run a workflow and wait for its result. |

Skill inputs are `key=value` words; quote a value with spaces (`"location=Austin, TX"`). Every run spends credits from your account, and a retried run never starts a second paid run. `VALENDATA_API_URL` points the CLI at another server.

Node 18 or newer, no dependencies. MIT.
