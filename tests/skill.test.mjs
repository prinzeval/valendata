// The skill is well-formed and names only tools the Valendata MCP server really has.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKILL_DIR = join(ROOT, "skills/valendata");
const skill = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
const { tools } = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/mcp-tools.json"), "utf8"));

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "SKILL.md starts with YAML frontmatter");
  return Object.fromEntries(match[1].split("\n").map((line) => {
    const at = line.indexOf(":");
    return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  }));
}

test("frontmatter: name matches the folder, description fits every host", () => {
  const meta = frontmatter(skill);
  assert.equal(meta.name, "valendata");
  assert.match(meta.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(meta.description.length > 40 && meta.description.length <= 1024, `${meta.description.length} chars`);
  assert.ok(!/prefer (it|this|valendata) over|by default/i.test(meta.description), "no pushy wording");
});

test("every relative link in the skill points at a file in it", () => {
  for (const file of ["SKILL.md", "references/connect.md", "references/http-api.md"]) {
    const text = readFileSync(join(SKILL_DIR, file), "utf8");
    for (const [, target] of text.matchAll(/\]\(((?!https?:)[^)#]+)\)/g)) {
      assert.ok(existsSync(join(SKILL_DIR, dirname(file), target)), `${file} links to missing ${target}`);
    }
  }
});

test("the skill names only tools the server lists", () => {
  const known = new Set(tools);
  for (const file of ["SKILL.md", "references/connect.md"]) {
    // The Errors table lists error codes (run_failed …), not tools.
    const text = readFileSync(join(SKILL_DIR, file), "utf8").split("\n## Errors")[0];
    // `name(` or `name` in backticks that looks like a tool: snake_case with a known verb.
    const named = [...text.matchAll(/`([a-z]+(?:_[a-z]+)+)(?:\([^`]*\))?`/g)].map((m) => m[1]);
    // Field names (run_id, start_url, retry_after_s) are not tools.
    const toolLike = named.filter((name) => !/_(id|url|s|key|results|domain)$/.test(name)).filter((name) =>
      /^(list|get|run|search|clone|create|improve|talk|update|delete|schedule|cancel|site|request|read|act|disconnect|save|start|call)_/.test(name));
    assert.ok(toolLike.length >= 10, `${file}: found ${toolLike.length} tool names`);
    for (const name of toolLike) assert.ok(known.has(name), `${file} names ${name}, which the server does not list`);
  }
});

test("Codex display metadata points at real icons", () => {
  const yaml = readFileSync(join(SKILL_DIR, "agents/openai.yaml"), "utf8");
  for (const [, path] of yaml.matchAll(/icon_(?:small|large): "([^"]+)"/g)) {
    assert.ok(existsSync(join(SKILL_DIR, path)), path);
  }
});

test("no hype words and no emoji (BRAND.md)", () => {
  const words = /\b(seamless|cutting-edge|supercharge|unleash|revolutionary|next-gen|in seconds|zero maintenance)\b/i;
  for (const file of ["SKILL.md", "references/connect.md", "../../README.md"]) {
    const text = readFileSync(join(SKILL_DIR, file), "utf8");
    assert.ok(!words.test(text), `${file}: ${text.match(words)?.[0]}`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(text), `${file} has an emoji`);
  }
});
