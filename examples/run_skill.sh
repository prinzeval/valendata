#!/bin/sh
# Find a skill, clone it, and run it over the Valendata REST API.
#
#   export VALENDATA_API_KEY="vd_sk_..."
#   sh examples/run_skill.sh
#
# Every run spends credits from your account; start small with max_results.
# API reference: https://docs.valendata.com/api-reference/introduction
set -eu
API="https://api.valendata.com/v1"
AUTH="Authorization: Bearer $VALENDATA_API_KEY"

# 1. Search the public marketplace (no key needed).
curl -s "$API/marketplace/search?q=google+maps+places&limit=3"

# 2. Clone the one you picked (free), then run the copy's slug from the answer.
#    curl -s -X POST "$API/skills/<slug>/clone" -H "$AUTH"

# 3. Run it and wait for the rows. Inputs go at the top level of the body.
#    curl -s -X POST "$API/skills/<your-copy-slug>/run" -H "$AUTH" \
#      -H "Content-Type: application/json" -H "Idempotency-Key: $(date +%s)" \
#      -d '{"search_query": "coffee", "location": "Lisbon", "max_results": 10}'

# 4. Pick the browser: "extension" runs in your own Chrome with the Valendata extension (it must
#    be open), for sites that block cloud browsers; "cloud" is Valendata's cloud browser; leave it
#    out to use the skill's own browser, else the cloud browser (it never switches by itself).
#    A 409 cloud_browser_paused or extension_not_connected means nothing ran and nothing was
#    charged; its detail says why. Running on the other browser is your call: your Chrome uses
#    its own sign-ins, which may be a different account.
#    curl -s -X POST "$API/skills/<your-copy-slug>/run" -H "$AUTH" \
#      -H "Content-Type: application/json" -H "Idempotency-Key: $(date +%s)" \
#      -d '{"search_query": "coffee", "location": "Lisbon", "max_results": 10, "browser_type": "extension"}'
