# Valendata over HTTP

Use this only when the MCP tools cannot be connected. The REST API does the same things. Each step names the MCP tool it matches.

- API base: `https://api.valendata.com`, routes under `/v1`.
- Auth: an API key `vd_sk_...` in `Authorization: Bearer <key>` or `x-api-key: <key>`. Read it from `VALENDATA_API_KEY`. Never print it.

## 1. Find a skill for the task

Search by the task in plain words. No key needed for the public marketplace.

```bash
curl -s "https://api.valendata.com/v1/marketplace/search?q=find+linkedin+jobs+in+toronto&limit=5"
```

MCP tool: `search_skills(query, site?, limit?)`.

Optional params: `site` (for example `linkedin.com`), `limit` (1-50, default 10). Each result has:

- `slug`, `name`, `description`, `site`, `yours` (the user's own skill, or one shared into their workspace)
- `inputs`: `name`, `type`, `required`
- `price.estimate_credits`, `price.estimate_usd`: what a run usually costs
- `health.success_rate_20`: success rate over the last 20 runs
- `sample_rows`: up to 3 rows the skill returned when it was published
- `match`: `"near"` means it does not do the task exactly; read `hint`
- `run_url`, `info_url`: the routes to run it and read it
- `clone_url`: the route to clone it; `null` when `yours` is `true`

Pick an exact match with good health. If every result is `near`, go to step 7.

**Workflows** (several steps chained: find, enrich, export…): add `kind=workflow` to the same search. MCP: `search_workflows(query, limit?)`. Results have the same fields, with `health.total_runs` only. Your own workflows join the search when the key has `workflows:read`. If every result is `near`, `hint` points to creating a workflow.

## 2. Read the contract

```bash
curl -s https://api.valendata.com/v1/skills/{slug} -H "Authorization: Bearer $VALENDATA_API_KEY"
```

MCP tool: `get_skill(skill)`. A public skill needs no key.

- `input_schema`: send only these inputs. `required` lists the ones you must send. Unknown inputs are refused.
- `output_json_schema`: the row shape. Use these field names.
- `price`: tell the user the cost before a big or repeated run.

Never invent an input. If a required input is unknown, ask the user.

## 3. Clone a skill that is not yours

You may read everything about a public skill, but you run only the user's own skills and their workspaces'. When `yours` is `false`, clone it first. Never run a public skill directly: the API answers `403` with `detail.error: "clone_required"` and `detail.clone_url`, and nothing runs.

```bash
curl -s -X POST https://api.valendata.com/v1/skills/{slug}/clone -H "Authorization: Bearer $VALENDATA_API_KEY"
```

MCP tool: `clone_skill(slug)`. Over MCP, `run_skill` refuses a public skill that is not cloned.

- Free. It answers `201` with the copy, as step 2 shows a skill, plus `cloned_from`.
- The copy has a new `slug`. Run that slug, not the original.
- Needs `skills:invoke` or `skills:write`.

A public workflow works the same way:

1. Read it: `GET /v1/workflows/{slug}` (MCP: `get_workflow(slug)`; the key needs `workflows:read`). One that is not yours has `yours: false`, `public_view` (its steps in plain words, sample rows, what it needs), `price`, and `clone_url`. Its graph is never shown.
2. Clone it: `POST /v1/workflows/{slug}/clone` (MCP: `clone_workflow(slug)`; needs `workflows:invoke` or `workflows:write`).
3. Run the copy's new slug: `POST /v1/workflows/{slug}/run` with `{"inputs": {...}}` (MCP: `run_workflow(slug, inputs)`; needs `workflows:invoke`).

## 4. Run it

Run the user's own skill, or the copy from step 3.

**Wait for the rows** (quick skills, interactive use). Inputs go at the top level of the body:

```bash
curl -s -X POST https://api.valendata.com/v1/skills/{slug}/run \
  -H "Authorization: Bearer $VALENDATA_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: <unique-id>" \
  -d '{"city": "Austin", "max_results": 20}'
```

Rows are in `data`. If the account is busy, this returns `429` with `Retry-After` instead of waiting.

**Run in the background** (long skills, batches, or after a busy `429`). Inputs go under `inputs`:

```bash
curl -s -X POST https://api.valendata.com/v1/skills/{slug}/runs \
  -H "Authorization: Bearer $VALENDATA_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: <unique-id>" \
  -d '{"inputs": {"city": "Austin"}, "max_results": 20}'
```

It answers `202` with `run_id`, `status`, and `poll_url`. A busy account queues the run instead of failing.

MCP tool: `skill_<slug>` or `run_skill(slug, inputs, max_results?)`. These wait up to 75 seconds, then answer `status: "running"` with a `run_id`.

Tips:

- Start small: `max_results` 10-30 until the user asks for more. It goes up to 500; `0` returns the whole list.
- Always send an `Idempotency-Key` (MCP: `idempotency_key`). A retry with the same key returns the first run and never charges twice.
- `browser_type` in the body picks the browser for this run: see Pick the browser below.

## 5. Poll a background run

```bash
curl -s https://api.valendata.com/v1/runs/{run_id} -H "Authorization: Bearer $VALENDATA_API_KEY"
```

MCP tool: `get_run(run_id)`.

Poll about every 30 seconds while `status` is `queued` or `running`. Stop at `success`, `partial`, `failed`, or `cancelled`. Rows are in `rows`. Stop a run with `POST /v1/runs/{run_id}/cancel` (MCP: `cancel_run`).

## 6. Read the result

- `status`: `success`, `partial` (some rows or fields missing), `failed`, `cancelled`.
- `count`, `credits_charged`. If `cost_final` is `false`, the final cost comes later.
- `drifted_fields`, `unverified_fields`, `truncated_sections`: say what is uncertain. Pass these on; do not hide them.
- `triage_kind` on a failed run says why (for example `site_down`, `blocked`, `logged_out`). A run keeps the credits it used, whatever the outcome.
- `needs_user`: the user must act (a login, a code, a human check). It has `kind`, `message`, and `action_url`. Show the message and link to the user, then run again after they act. Do not retry before that.
- `diagnosis`: why rows came back short. Its hint can be passed to improve (step 7).
- `browser_used` (`cloud`, `extension`, or `null` when no browser opened) and `browser_note`, one plain line on where it ran, such as "Ran on your Chrome (the cloud browser is paused)." A workflow run has them on each of its `steps`, `nested_browsers` on a step that runs another workflow (that workflow's steps, each with `inside`), and one `browser_summary` line for the whole run, such as "Browsers: 3 steps on your Chrome (2 moved: the cloud browser is paused)."

## Pick the browser

Runs, schedules and new skills can say where the browser opens. Leave it out unless there is a reason: Valendata uses the skill's or step's own browser, and the user's Chrome when the cloud browser is paused. When to pick one: [Which browser](../SKILL.md#which-browser).

| Route | Field | Values |
| --- | --- | --- |
| `POST /v1/skills/{slug}/run`, `/runs` | `browser_type`, at the top level of the body (a run setting, not an input) | `remote` (or `cloud`), `extension`, `none`, `auto` |
| `POST /v1/workflows/{slug}/run`, `/runs` | `browser_type` | `remote` (or `cloud`), `extension`, `auto` |
| `POST /v1/skills/{slug}/schedules`, `POST /v1/workflows/{slug}/schedules`, `PATCH /v1/schedules/{id}` | `browser_type` | `remote` (or `cloud`), `extension`; `auto` or `null` is automatic again |
| `PATCH /v1/skills/{slug}`: the browser a run uses when it does not pick one | `browser_type` | `remote` (or `cloud`), `extension`, `none`; `auto` clears it |
| `PATCH /v1/workflows/{slug}`: every browser step at once | `browser_type` | `cloud`, `extension`; `auto` gives each step its own again |
| `POST /v1/skills` (step 7) | `browser` | `auto` (default), `cloud`, `extension` |

- `remote` (`cloud`) is the cloud browser. `extension` is the user's own Chrome with the Valendata extension, which must be open and connected. `none` runs a skill with no browser. `auto` lets Valendata pick.
- A workflow's `cloud` or `extension` covers every browser step, nested workflows included. `auto` keeps each step's own browser, so a workflow with steps on both stays that way.
- Schedule views (`GET /v1/schedules`) carry `browser_type`: `null` is automatic.
- `GET /v1/account` has `cloud_browser`; its `state` is `paused` while the cloud browser is paused.

```bash
curl -s -X POST https://api.valendata.com/v1/skills/{slug}/runs \
  -H "Authorization: Bearer $VALENDATA_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: <unique-id>" \
  -d '{"inputs": {"city": "Austin"}, "max_results": 20, "browser_type": "extension"}'
```

MCP: the same tools take `browser` with `auto`, `cloud` or `extension`.

## Errors

Every error has `detail`, `code`, `type`, and `request_id`.

| Status | `code` / `type` | Do this |
| --- | --- | --- |
| `401` | `unauthorized` | Key missing, wrong, revoked, or expired. Ask the user for a valid key. |
| `402` | `payment_required` / `billing_error` | Not enough credits (`detail` has `current_balance` and `required`) or the spend cap is reached. Nothing ran, nothing charged. Stop and tell the user to top up. Do not retry. |
| `403` | `permission_denied` | `detail.error` is `clone_required`: clone the skill (`detail.clone_url`) and run the copy. Otherwise the key lacks a scope. Tell the user which one. |
| `404` | `not_found` | Wrong slug or id, or not theirs to see. Search again. |
| `409` | `conflict`, `idempotency_key_in_use` | Read `detail`. Wait for the first request, or use a new `Idempotency-Key` for a new run. |
| `409` | `cloud_browser_paused` | The cloud browser is paused. Run again with `browser_type` `extension`, or leave it out. Nothing ran, nothing charged. |
| `409` | `extension_not_connected` | The user's Chrome with the Valendata extension is not connected. Ask them to open it, or run again with `remote`. Nothing ran, nothing charged. |
| `422` | `validation_error` | Fix the inputs. `detail.allowed_inputs` lists the valid ones. |
| `429` | `rate_limited` / `rate_limit_error` | Wait `Retry-After` seconds and retry with the same `Idempotency-Key`, or start a background run, which queues. |
| `500` | `internal_error` | Retry once. Quote `request_id` if it keeps failing. |

Over MCP, a tool error has `error.code`: `insufficient_credits` and `spend_cap` mean the same as `402`; `capacity_full` means wait `retry_after_s`; `needs_user` and `run_failed` as above; the two browser refusals are `cloud_browser_paused` and `extension_not_connected`, and `next_step` says which `browser` to try.

## 7. No skill fits: create one

```bash
curl -s -X POST https://api.valendata.com/v1/skills \
  -H "Authorization: Bearer $VALENDATA_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: <unique-id>" \
  -d '{"task": "Search for dentists in Austin and list them",
       "start_url": "https://www.google.com/maps",
       "inputs": {"city": "Austin"},
       "output_fields": {"name": "business name", "phone": "phone number"}}'
```

MCP tool: `create_skill(task, start_url, name?, inputs?, output_fields?)`.

- A cloud browser does the task, learns the steps, and checks them (`browser`: `extension` records in the user's Chrome instead, for a site that blocks cloud browsers). It takes a few minutes, needs at least 10 credits to start, and an API key needs the `skills:write` scope.
- It answers `202` with `creation_id`. Poll `GET /v1/skill-creations/{creation_id}` (MCP: `get_skill_creation`) about every 30 seconds while `status` is `queued`, `recording`, or `validating`. Pass on the `progress` line.
- `ready`: run it with its `slug` (step 4).
- `needs_fix`: a draft was saved. Fix it with `POST /v1/skills/{slug}/improve` and `{"feedback": "..."}` (MCP: `improve_skill`; an API key needs `skills:write`). Do not create it again.
- `failed`: nothing was saved. Read `error` and `next_step`.

Always follow `next_step` when an answer has one.

## Docs

- Index for LLMs: https://docs.valendata.com/llms.txt
- API errors and limits: https://docs.valendata.com/api-reference/errors
- MCP tools: https://docs.valendata.com/ai-assistants/mcp-tools
