# Changelog

## Unreleased

- Pick the browser for every run, schedule and new skill: the cloud browser, your own Chrome with the Valendata extension, or auto (the default). The skill has a Which browser section telling the agent when to switch (cloud browser paused, Chrome not connected, sites that block cloud browsers, mixed workflows), and `references/http-api.md` documents `browser_type`, `browser`, `browser_used` and `browser_note`, and the two `409` refusals.
- CLI: `--browser auto|cloud|extension` on `run` and `workflow`, and the new `create`, `schedule`, `schedules`, `schedule-update` and `update` commands. A run says where it ran, `run --json` prints the rows with `browser_used` and `browser_note`, and a paused cloud browser or a Chrome that isn't connected says which `--browser` to try.

## 0.3.0 — 2026-10-25

- The skill covers the web tools (`scrape_url`, `search_web`, `map_site`, `crawl_site`, `extract_data`, and Firecrawl's tool names) and batch runs (`run_skill_batch`).
- Repairs and failed runs are described as they are billed: every run keeps the credits it used.
- New `examples/`: prompts, the Firecrawl SDK, `apify-client` and the REST API pointed at Valendata.
- README rewritten: what an agent can do with Valendata, compatibility, pricing.

## 0.2.0 — 2026-10-21

- First version: the Valendata MCP server and skill for Claude Code, Codex and Cursor, with an install script.
