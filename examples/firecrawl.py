"""Firecrawl's official Python SDK, pointed at Valendata.

    pip install firecrawl-py
    export VALENDATA_API_KEY="vd_sk_..."
    python examples/firecrawl.py

Only the base URL and the key change. Pricing: a plain page is 0.1 credit ($0.001), a page that
needs the cloud browser 0.5 credit. See https://docs.valendata.com/api-reference/web-api
"""

import os

from firecrawl import Firecrawl

app = Firecrawl(api_key=os.environ["VALENDATA_API_KEY"], api_url="https://api.valendata.com")

# One page as Markdown, plus its links.
doc = app.scrape("https://news.ycombinator.com", formats=["markdown", "links"])
print(doc.markdown[:500])

# A site's page addresses.
print(app.map("https://docs.valendata.com"))
