# Valendata benchmark

The same five everyday jobs, given in the same words to Valendata and to the tools people use
today: an AI browser agent (browser-use), AI extraction (Firecrawl) and the market leader's
ready-made actors (Apify). Every run is kept, failures included, so anyone can check the numbers
or run them again.

**The claim under test:** a Valendata skill works a site out once; after that every run is a
replay that uses no AI tokens (AI only steps in to repair a skill when the site changes). An AI
agent thinks through every click on every run.

## Results so far

| Round | When | Valendata | Firecrawl | browser-use | What it showed |
| --- | --- | --- | --- | --- | --- |
| 1 | Oct 26 | 0/5 | 5/5, 15.8 s | 5/5, 121.7 s | Valendata's cloud browser was paused (its proxy plan had lapsed); every run refused, nothing charged. |
| 2 | Oct 26 | 5/5, 31.8 s, 80% filled | 5/5, 11.6 s | 5/5, 120.8 s | The skill used had never passed its own test: a blank row, a category where the event text should be. That led to the engine fixes below. |
| 3 | Oct 26 | 5/5, 3.6 s, 100% correct | 5/5, 7.3 s, 40% | 5/5, 121.9 s, 40% | Rebuilt skill: learned from its recording, it runs with one page download, no browser, no AI. |
| 4 | Oct 27 | 5/5, 2.8 s, 100% correct | 5/5, 6.6 s, 20% | 4/5, 74.7 s, 60% | Same as round 3. |

"Correct" = the row's text is really on the page fetched when the run ended (AI tools rewrite sentences, which this catches). Not claimed yet: "same answer every run". Wikipedia sometimes served Valendata a slightly older cached copy of the page, so its answers differed between runs even though each matched the page it got. Answers are compared only between runs that met the same page text.

Token counts: neither Valendata's nor Firecrawl's answers carry one, so they show as "not reported", never 0 (rounds 1–2 were corrected from the run records on Oct 26).

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
