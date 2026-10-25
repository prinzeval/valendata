// scripts/install.sh, run against throwaway config folders only.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(ROOT, "scripts/install.sh");

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), "valendata-install-"));
  const env = {
    PATH: "/usr/bin:/bin", // no claude / codex on PATH: the script must not need them
    HOME: home,
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    CODEX_HOME: join(home, ".codex"),
    CURSOR_CONFIG_DIR: join(home, ".cursor"),
    AGENTS_SKILLS_DIR: join(home, ".agents/skills"),
  };
  return { home, env, done: () => rmSync(home, { recursive: true, force: true }) };
}

function install(env, ...args) {
  const node = process.execPath.replace(/\/node$/, "");
  return spawnSync("sh", [SCRIPT, ...args], { env: { ...env, PATH: `${env.PATH}:${node}` }, encoding: "utf8" });
}

test("codex: adds the server to config.toml once, keeps what was there, installs the skill", () => {
  const box = sandbox();
  try {
    mkdirSync(box.env.CODEX_HOME, { recursive: true });
    writeFileSync(join(box.env.CODEX_HOME, "config.toml"), 'model = "x"\n');
    for (let round = 0; round < 2; round += 1) assert.equal(install(box.env, "codex").status, 0);
    const toml = readFileSync(join(box.env.CODEX_HOME, "config.toml"), "utf8");
    assert.equal(toml, 'model = "x"\n\n[mcp_servers.valendata]\nurl = "https://api.valendata.com/mcp"\n');
    assert.ok(existsSync(join(box.env.AGENTS_SKILLS_DIR, "valendata/SKILL.md")));
  } finally {
    box.done();
  }
});

test("cursor: merges into mcp.json without touching other servers", () => {
  const box = sandbox();
  try {
    mkdirSync(box.env.CURSOR_CONFIG_DIR, { recursive: true });
    const file = join(box.env.CURSOR_CONFIG_DIR, "mcp.json");
    writeFileSync(file, JSON.stringify({ mcpServers: { other: { url: "https://example.com/mcp" } } }));
    for (let round = 0; round < 2; round += 1) assert.equal(install(box.env, "cursor").status, 0);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {
      mcpServers: { other: { url: "https://example.com/mcp" }, valendata: { url: "https://api.valendata.com/mcp" } },
    });
    assert.ok(existsSync(join(box.env.CURSOR_CONFIG_DIR, "skills/valendata/SKILL.md")));
  } finally {
    box.done();
  }
});

test("--api-key-env writes the variable's name, never its value", () => {
  const box = sandbox();
  try {
    const env = { ...box.env, MY_VD_KEY: "vd_sk_secret_value" };
    assert.equal(install(env, "codex", "--api-key-env", "MY_VD_KEY").status, 0);
    assert.equal(install(env, "cursor", "--api-key-env", "MY_VD_KEY").status, 0);
    const toml = readFileSync(join(box.env.CODEX_HOME, "config.toml"), "utf8");
    const cursor = readFileSync(join(box.env.CURSOR_CONFIG_DIR, "mcp.json"), "utf8");
    assert.match(toml, /bearer_token_env_var = "MY_VD_KEY"/);
    assert.equal(JSON.parse(cursor).mcpServers.valendata.headers.Authorization, "Bearer ${env:MY_VD_KEY}");
    for (const text of [toml, cursor]) assert.ok(!text.includes("vd_sk_secret_value"));
  } finally {
    box.done();
  }
});

test("claude without the claude command: installs the skill and prints the one command to run", () => {
  const box = sandbox();
  try {
    const result = install(box.env, "claude");
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(box.env.CLAUDE_CONFIG_DIR, "skills/valendata/SKILL.md")));
    assert.match(result.stderr, /claude mcp add-json --scope user valendata '\{"type":"http","url":"https:\/\/api\.valendata\.com\/mcp"\}'/);
  } finally {
    box.done();
  }
});

test("--dry-run changes nothing", () => {
  const box = sandbox();
  try {
    const result = install(box.env, "all", "--dry-run");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /would add \[mcp_servers\.valendata\]/);
    assert.ok(!existsSync(join(box.env.CODEX_HOME, "config.toml")));
    assert.ok(!existsSync(join(box.env.CURSOR_CONFIG_DIR, "mcp.json")));
    assert.ok(!existsSync(join(box.env.CLAUDE_CONFIG_DIR, "skills")));
  } finally {
    box.done();
  }
});

test("refuses a bad server URL, a bad variable name and an unknown host", () => {
  const box = sandbox();
  try {
    assert.notEqual(install({ ...box.env, VALENDATA_MCP_URL: "http://example.com/mcp" }, "codex").status, 0);
    assert.notEqual(install({ ...box.env, VALENDATA_MCP_URL: 'https://a.com/mcp"x' }, "codex").status, 0);
    assert.notEqual(install(box.env, "codex", "--api-key-env", "BAD-NAME").status, 0);
    assert.notEqual(install(box.env, "vscode").status, 0);
    assert.ok(!existsSync(join(box.env.CODEX_HOME, "config.toml")));
  } finally {
    box.done();
  }
});

test("a local server URL goes into the config as given", () => {
  const box = sandbox();
  try {
    assert.equal(install({ ...box.env, VALENDATA_MCP_URL: "http://localhost:8000/mcp" }, "codex").status, 0);
    assert.match(readFileSync(join(box.env.CODEX_HOME, "config.toml"), "utf8"), /url = "http:\/\/localhost:8000\/mcp"/);
  } finally {
    box.done();
  }
});
