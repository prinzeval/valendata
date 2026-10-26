"""One browser-use run of a benchmark task: the AI agent clicks through the site itself.

Run from the browser-use checkout so its own environment is used:
    uv run --project ~/Desktop/browser-use python bench/agents/browser_use_task.py '<task json>'
Reads DEEPSEEK_API_KEY from the environment. Prints ONE JSON line: seconds, steps, tokens (input,
cached input, output), the agent's answer (parsed as JSON when it is JSON) and whether it finished.
DeepSeek is reached through browser-use's OpenAI-compatible client: its own DeepSeek client never
reports token use, which would make every run look free.
"""

import asyncio
import json
import os
import sys
import time

from browser_use import Agent, BrowserProfile
from browser_use.llm.openai.chat import ChatOpenAI


def parse_answer(text):
    if not text:
        return []
    start = min([i for i in (text.find("["), text.find("{")) if i >= 0], default=-1)
    if start < 0:
        return text
    try:
        return json.loads(text[start:])
    except json.JSONDecodeError:
        return text


async def main(task):
    # DeepSeek refuses the strict json_schema response_format: the schema goes in the prompt instead.
    llm = ChatOpenAI(model=task.get("model", "deepseek-flash"), base_url="https://api.deepseek.com/v1",
                     api_key=os.environ["DEEPSEEK_API_KEY"],
                     add_schema_to_system_prompt=True, dont_force_structured_output=True)
    agent = Agent(
        task=task["prompt"] + " Answer with the JSON only.",
        llm=llm,
        browser_profile=BrowserProfile(headless=True),
    )
    started = time.monotonic()
    history = await agent.run(max_steps=task.get("max_steps", 40))
    seconds = time.monotonic() - started
    usage = history.usage
    print(json.dumps({
        "ok": bool(history.is_done() and history.is_successful() is not False),
        "seconds": seconds,
        "steps": history.number_of_steps(),
        "tokens": usage.total_tokens if usage else 0,
        "input_tokens": (usage.total_prompt_tokens - usage.total_prompt_cached_tokens) if usage else 0,
        "cached_tokens": usage.total_prompt_cached_tokens if usage else 0,
        "output_tokens": usage.total_completion_tokens if usage else 0,
        "output": parse_answer(history.final_result()),
    }))


if __name__ == "__main__":
    asyncio.run(main(json.loads(sys.argv[1])))
