# Valendata benchmark

The same five everyday jobs, given in the same words to Valendata and to the tools people use
today: an AI browser agent (browser-use), AI extraction (Firecrawl) and the market leader's
ready-made actors (Apify). Every run is kept, failures included, so anyone can check the numbers
or run them again.

**The claim under test:** a Valendata skill works a site out once; after that every run is a
replay that uses no AI tokens (AI only steps in to repair a skill when the site changes). An AI
agent thinks through every click on every run.

## What is measured, per run

| | |
| --- | --- |
| Time | seconds from the request to the rows, measured on the caller's side |
| Cost | what the tool itself billed: Valendata credits, Apify's `usageTotalUsd`, the AI agent's tokens at the model's price |
| AI tokens | tokens the run used (a Valendata replay: 0 unless it repaired itself) |
| Rows, fields filled | how many rows came back and the share of asked-for fields that have a value |
| Same answer every run | a fingerprint of the asked-for fields; equal answers, equal fingerprints |

Correctness is checked by hand against the live page for the published results (`sample` in each
result line keeps the first rows for that).

## The tasks

See [`tasks.json`](tasks.json): Wikipedia current events, Walmart search, an Instagram profile,
Google Maps, Zillow. A tool with no entry for a task is skipped and the report says why.

## Run it

Keys come from the environment and are never printed:

```bash
valendata login                      # Valendata (or VALENDATA_API_KEY)
export FIRECRAWL_API_KEY=…           # Firecrawl
export APIFY_TOKEN=…                 # Apify
export DEEPSEEK_API_KEY=…            # the model browser-use runs on
```

```bash
node bench/run.mjs                                   # the plan and its estimated cost; spends nothing
node bench/run.mjs --task wikipedia --runs 5 --yes   # run it (every tool that has a key)
node bench/report.mjs bench/results/<date>.jsonl     # the table, plus <date>.summary.json
```

browser-use runs from its own checkout (`BROWSER_USE_DIR`, default `~/Desktop/browser-use`) with
`uv`. Prices used to turn tokens into dollars live in [`pricing.json`](pricing.json).

## Fairness rules

- Same task wording, same machine, same time window for every tool.
- Every run goes in the results file, failures included. No cherry-picking.
- A task where Valendata loses is reported like any other.
- Valendata's one-time cost of building a skill is reported separately, with the number of runs
  after which it pays for itself.

## Tests

```bash
node --test bench/tests/*.test.mjs
```
