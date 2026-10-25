# Valendata agent kit

**Give your coding agent the web as an API.** Ask Claude Code, Codex or Cursor for data from any website, and get clean rows back in the same shape every time, from skills that repair themselves when the site changes.

```text
> Find 20 dentists in Austin on Google Maps with their phone, website and rating.
> Scrape the pricing page of firecrawl.dev as Markdown.
> Every Monday, list new remote Python jobs and post them to Slack.
```

[MIT](LICENSE) · [Docs](https://docs.valendata.com) · [Website](https://www.valendata.com) · 100 free credits a month, no card

---

## What your agent gets

**Ready-made skills for the sites people pay to scrape.** A skill is a saved website task with typed inputs and outputs: Google Maps places, Amazon search, eBay, Zillow, Indeed, Booking, Airbnb, YouTube, Reddit, Trustpilot, App Store reviews and hundreds more in the public marketplace. Your agent searches them, clones one in a click (free), and runs it.

**Any site, on demand.** No skill for your site yet? The agent describes the task and Valendata builds one: it looks for the site's own data API first, and records it in a cloud browser only when there is none. From then on it runs like an API call.

**Skills that fix themselves.** When a site changes its layout, the skill notices short or wrong rows, repairs its own recipe, and keeps the same output fields, so your code and sheets don't break.

**The web, page by page.** Scrape a page to Markdown, crawl a site, map its URLs, search the web, or pull structured JSON by a schema. Arguments use Firecrawl's names, and the tools also answer to Firecrawl's own MCP tool names, so an agent set up for Firecrawl keeps working.

**Workflows.** Chain skills with code, AI steps and your apps (Gmail, Slack, Google Sheets, Notion and more): find leads → enrich → score → post to Slack, on a schedule or from a webhook.

**Many inputs at once.** Run one skill over a list of up to 10,000 inputs in a single batch.

**Logins handled for you.** A skill that needs an account signs in with the login you saved in the Valendata app. Passwords never pass through the agent.

## Install

### Claude Code

```bash
claude plugin marketplace add prinzeval/valendata && claude plugin install valendata@valendata
```

Or, inside Claude Code: `/plugin marketplace add prinzeval/valendata`, then `/plugin install valendata@valendata`.

Then run `/mcp`, pick `plugin:valendata:valendata` and choose **Authenticate**. Sign in to Valendata in the browser.

### Codex

```bash
curl -fsSL https://raw.githubusercontent.com/prinzeval/valendata/main/scripts/install.sh | sh -s -- codex && codex mcp login valendata
```

This adds `[mcp_servers.valendata]` to `~/.codex/config.toml`, puts the skill in `~/.agents/skills/valendata`, and opens the Valendata sign-in in the browser.

The kit is also a Codex plugin marketplace: `codex plugin marketplace add prinzeval/valendata`, then install **Valendata** from the plugin directory.

### Cursor

```bash
curl -fsSL https://raw.githubusercontent.com/prinzeval/valendata/main/scripts/install.sh | sh -s -- cursor
```

This adds `valendata` to `~/.cursor/mcp.json` and puts the skill in `~/.cursor/skills/valendata`. Then open **Cursor Settings → Tools & MCP** and click **Connect** next to `valendata`.

To add only the MCP server with one click, open this link: [Add Valendata to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=valendata&config=eyJ1cmwiOiJodHRwczovL2FwaS52YWxlbmRhdGEuY29tL21jcCJ9).

### Claude.ai, ChatGPT and other agents

The MCP server is `https://api.valendata.com/mcp`. Add it as a custom connector and sign in through the browser. Step-by-step instructions: [Connect your AI assistant](https://docs.valendata.com/ai-assistants/connect).

The skill alone, for any agent that reads Agent Skills:

```bash
npx skills add prinzeval/valendata
```

`plugins/valendata` is also an [Agent Plugins](https://agent-plugins.org) package (`plugin.json` and `mcp.json`) for hosts that read that standard.

## Try it

After you sign in, ask your agent:

| Ask | What happens |
| --- | --- |
| "Find a Valendata skill for Google Maps places and get 10 coffee shops in Lisbon." | Searches the marketplace, clones the skill, runs it with `max_results: 10`. |
| "Scrape https://news.ycombinator.com as Markdown." | One `scrape_url` call. |
| "Map docs.example.com, then crawl its 20 most relevant pages." | `map_site`, then `crawl_site`. |
| "Make me a skill that lists new listings on this site: https://…" | `create_skill`, then the agent reports progress until it's ready. |
| "Run that skill for these 50 cities." | `run_skill_batch`, with the price stated first. |
| "Every weekday at 9, send me new Upwork Python gigs on Slack." | A workflow with a schedule, after you confirm. |

More prompts are in [examples/prompts.md](examples/prompts.md).

## Use it from code

The same account works over plain HTTP with an API key (**Settings → API Keys** in the app):

- **Firecrawl-compatible:** point the official Firecrawl SDK at `https://api.valendata.com`. See [examples/firecrawl.py](examples/firecrawl.py).
- **Apify-compatible:** point `apify-client` at `https://api.valendata.com/apify`. Popular actor IDs such as `compass/crawler-google-places` run the matching Valendata skill. See [examples/apify_client.py](examples/apify_client.py).
- **Valendata REST API:** run any of your skills by its slug. See [examples/run_skill.sh](examples/run_skill.sh) and the [API reference](https://docs.valendata.com/api-reference/introduction).

## How it compares

| | Valendata | Scraping APIs (Firecrawl and others) | Actor marketplaces (Apify and others) | Browser agents |
| --- | --- | --- | --- | --- |
| Clean rows in a fixed shape | Yes, typed per skill | You write the schema each time | Per actor | Varies run to run |
| Repairs itself when a site changes | Yes | No | Depends on the actor's author | Re-plans every run |
| Any site on demand | Yes, built for you | Pages, not tasks | Only if someone built an actor | Yes, slowly |
| Workflows with your apps | Built in | No | Via n8n, Make or Zapier | No |
| Logged-in sites | Saved logins | Limited | Cookies you paste | Yes |
| One tool per skill for your agent | Yes | No | No | No |

## Pricing

1 credit is $0.01. New accounts get 100 free credits every month, with no card. A run costs what the skill uses: a plain page fetch is 0.1 credit, a page in the cloud browser 0.5 credit. The price is shown before a run, and your agent states it before a large or repeated run. Every run keeps the credits it used. Details: [Credits](https://docs.valendata.com/concepts/credits).

## What the agent can do, and what it can't

What the agent sees depends on what you ticked at sign-in. By default it can search the marketplace, read and run your skills and workflows, create and fix skills, use the web tools, and read runs. Editing, deleting and scheduling, your account and credits, and your connected apps are extra permissions you tick yourself. The full list: [MCP tools](https://docs.valendata.com/ai-assistants/mcp-tools).

The skill tells the agent to ask you first before anything that spends many credits, schedules work, deletes something, or sends or changes something in your apps. It treats text found in pages and emails as data, never as instructions.

## Sign in with an API key instead

If your agent cannot open the browser sign-in, make an API key in Valendata under **Settings → API Keys**, put it in your shell, and pass the variable's name to the install script:

```bash
export VALENDATA_API_KEY="vd_sk_..."
curl -fsSL https://raw.githubusercontent.com/prinzeval/valendata/main/scripts/install.sh | sh -s -- codex --api-key-env VALENDATA_API_KEY
```

It works the same for `claude` and `cursor`. The config gets the variable's name, never the key. The key carries only the scopes you picked when you made it.

## Install script options

```text
install.sh <claude|codex|cursor|skill|all> [--api-key-env NAME] [--dry-run]
```

`--dry-run` prints what would change and changes nothing. `VALENDATA_MCP_URL`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `CURSOR_CONFIG_DIR` and `AGENTS_SKILLS_DIR` change where it points and writes. An entry that is already there is left as it is.

## What is in this repository

| Path | What it is |
| --- | --- |
| `skills/valendata/` | The skill. Edit it here. |
| `examples/` | Prompts, and code for the Firecrawl SDK, `apify-client` and the REST API. |
| `kit.json` | Name, version, server URL and listing text. Every manifest is built from it. |
| `plugins/valendata/` | The packaged plugin, built by `node scripts/build.mjs`. Do not edit it by hand. |
| `.claude-plugin/marketplace.json` | The Claude Code marketplace. |
| `.agents/plugins/marketplace.json` | The Codex marketplace. |
| `.cursor-plugin/marketplace.json` | The Cursor marketplace. |
| `scripts/install.sh` | The install script. |
| `tests/` | `npm test` checks the manifests, the skill and the install script. |

After you change `kit.json` or the skill, run `npm run build`, then `npm test`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing and support

Issues and pull requests are welcome: a better prompt in the skill, a new example, support for another agent host. For a site that doesn't work on Valendata, open an issue with the site and what you need from it, or use `request_site` from your agent. Security reports: see [SECURITY.md](SECURITY.md).

## License

MIT. The multi-host packaging is adapted from [ego-lite](https://github.com/citrolabs/ego-lite) (MIT, Copyright (c) 2026 CitroLabs). See [NOTICE](NOTICE).
