"""Apify's official Python client, pointed at Valendata.

    pip install apify-client
    export VALENDATA_API_KEY="vd_sk_..."
    python examples/apify_client.py

Popular actor IDs run the matching Valendata skill and answer with Apify's field names, so
sheets and CRMs fed by an Apify run keep working. See
https://docs.valendata.com/guides/switch-from-apify
"""

import os

from apify_client import ApifyClient

client = ApifyClient(token=os.environ["VALENDATA_API_KEY"], api_url="https://api.valendata.com/apify")

run = client.actor("compass/crawler-google-places").call(run_input={
    "searchStringsArray": ["dentist"],
    "locationQuery": "Austin, TX",
    "maxCrawledPlacesPerSearch": 5,
})
for place in client.dataset(run.default_dataset_id).list_items().items:
    print(place["title"], place["totalScore"], place["phone"])
