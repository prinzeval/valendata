// Every host manifest agrees with kit.json, follows its host's documented shape, and is
// in step with the build.
//
// Shapes checked against these docs (read 2026-10-21):
//   Claude Code  https://code.claude.com/docs/en/plugins-reference
//                https://code.claude.com/docs/en/plugins/marketplace-reference
//   Codex        https://developers.openai.com/codex/plugins/build
//   Cursor       https://cursor.com/docs/reference/plugins
//   Agent Plugins https://agent-plugins.org/schemas/1.0.0/plugin.schema.json and mcp.schema.json

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const kit = read("kit.json");
const PLUGIN = `plugins/${kit.name}`;

function onlyKeys(object, allowed, label) {
  const extra = Object.keys(object).filter((key) => !allowed.includes(key));
  assert.deepEqual(extra, [], `${label} has keys its host does not know: ${extra.join(", ")}`);
}

function pathInPlugin(path, label) {
  assert.match(path, /^\.\//, `${label}: ${path} must start with ./`);
  assert.ok(!path.includes(".."), `${label}: ${path} must stay inside the plugin`);
  assert.ok(existsSync(join(ROOT, PLUGIN, path)), `${label}: ${path} does not exist`);
}

test("the generated files are in step with kit.json and skills/", () => {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts/build.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("every manifest carries the kit's name and version", () => {
  for (const path of [
    `${PLUGIN}/plugin.json`,
    `${PLUGIN}/.claude-plugin/plugin.json`,
    `${PLUGIN}/.codex-plugin/plugin.json`,
    `${PLUGIN}/.cursor-plugin/plugin.json`,
  ]) {
    const manifest = read(path);
    assert.equal(manifest.name, kit.name, path);
    assert.equal(manifest.version, kit.version, path);
  }
  assert.equal(read("package.json").version, kit.version, "package.json");
  assert.equal(read(".cursor-plugin/marketplace.json").plugins[0].version, kit.version);
});

test("Claude Code: marketplace and plugin manifest", () => {
  const market = read(".claude-plugin/marketplace.json");
  onlyKeys(market, ["$schema", "name", "owner", "plugins", "description", "version", "metadata"], "marketplace");
  assert.match(market.name, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
  assert.ok(market.owner.name);
  const [entry] = market.plugins;
  assert.equal(entry.name, kit.name);
  assert.equal(entry.source, `./${PLUGIN}`);
  assert.ok(!("version" in entry), "the version lives in plugin.json only (validate warns on both)");
  const manifest = read(`${PLUGIN}/.claude-plugin/plugin.json`);
  // The keys Claude Code 2.1.63 accepts (the oldest version this kit was validated with).
  onlyKeys(manifest, ["name", "version", "description", "author", "homepage", "repository", "license", "keywords"],
    ".claude-plugin/plugin.json");
  assert.match(manifest.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case");
});

test("Codex: marketplace and plugin overlay", () => {
  const market = read(".agents/plugins/marketplace.json");
  const [entry] = market.plugins;
  assert.equal(entry.name, kit.name);
  assert.deepEqual(entry.source, { source: "local", path: `./${PLUGIN}` });
  assert.ok(["AVAILABLE", "INSTALLED_BY_DEFAULT", "NOT_AVAILABLE"].includes(entry.policy.installation));
  assert.equal(entry.policy.authentication, "ON_INSTALL");
  assert.ok(entry.category);
  const overlay = read(`${PLUGIN}/.codex-plugin/plugin.json`);
  pathInPlugin(overlay.skills, "skills");
  pathInPlugin(overlay.mcpServers, "mcpServers");
  onlyKeys(overlay.interface, ["displayName", "shortDescription", "longDescription", "developerName", "category",
    "capabilities", "websiteURL", "privacyPolicyURL", "termsOfServiceURL", "defaultPrompt", "brandColor",
    "composerIcon", "logo", "screenshots"], "interface");
  pathInPlugin(overlay.interface.composerIcon, "composerIcon");
  pathInPlugin(overlay.interface.logo, "logo");
  for (const key of ["websiteURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    assert.match(overlay.interface[key], /^https:\/\//, key);
  }
});

test("Cursor: marketplace and plugin manifest", () => {
  const market = read(".cursor-plugin/marketplace.json");
  onlyKeys(market, ["name", "owner", "plugins", "metadata"], "marketplace");
  assert.ok(market.owner.name);
  assert.ok(existsSync(join(ROOT, market.plugins[0].source, ".cursor-plugin/plugin.json")));
  const manifest = read(`${PLUGIN}/.cursor-plugin/plugin.json`);
  onlyKeys(manifest, ["name", "displayName", "description", "version", "author", "homepage", "repository", "license",
    "keywords", "logo", "rules", "agents", "skills", "commands", "hooks", "mcpServers", "variables"], "plugin.json");
  pathInPlugin(manifest.skills, "skills");
  assert.ok(existsSync(join(ROOT, PLUGIN, manifest.logo)), "logo");
  onlyKeys(manifest.author, ["name", "email", "url"], "author");
});

test("Agent Plugins 1.0.0: plugin.json and mcp.json follow the published schemas", () => {
  const manifest = read(`${PLUGIN}/plugin.json`);
  assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  onlyKeys(manifest, ["$schema", "name", "version", "description", "author", "homepage", "repository", "license",
    "keywords", "extensions"], "plugin.json");
  assert.match(manifest.name, /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
  assert.ok(manifest.name.length <= 64);
  onlyKeys(manifest.author, ["name", "email", "url"], "author");
  const mcp = read(`${PLUGIN}/mcp.json`);
  assert.equal(mcp.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
  onlyKeys(mcp, ["$schema", "mcpServers"], "mcp.json");
  for (const server of Object.values(mcp.mcpServers)) {
    onlyKeys(server, ["type", "url", "headers"], "streamable-http server");
    assert.equal(server.type, "streamable-http");
  }
});

test("every MCP config names one server at the kit's URL, with no credentials", () => {
  const configs = {
    ".mcp.json": read(`${PLUGIN}/.mcp.json`).mcpServers,
    "mcp.json": read(`${PLUGIN}/mcp.json`).mcpServers,
    ".cursor-plugin": read(`${PLUGIN}/.cursor-plugin/plugin.json`).mcpServers,
  };
  for (const [label, servers] of Object.entries(configs)) {
    assert.deepEqual(Object.keys(servers), [kit.mcp.name], label);
    const server = servers[kit.mcp.name];
    assert.equal(server.url, kit.mcp.url, label);
    assert.ok(!("headers" in server), `${label}: no headers, so the host signs in with OAuth`);
  }
  assert.equal(configs[".mcp.json"][kit.mcp.name].type, "http");
  assert.match(kit.mcp.url, /^https:\/\//);
});

test("the build can point a copy of the kit at another server, and only a copy", () => {
  const out = join(mkdtempSync(join(tmpdir(), "valendata-kit-")), "kit");
  const result = spawnSync(process.execPath,
    [join(ROOT, "scripts/build.mjs"), "--out", out, "--mcp-url", "http://localhost:8000/mcp"], { encoding: "utf8" });
  try {
    assert.equal(result.status, 0, result.stderr);
    const copy = JSON.parse(readFileSync(join(out, PLUGIN, ".mcp.json"), "utf8"));
    assert.equal(copy.mcpServers[kit.mcp.name].url, "http://localhost:8000/mcp");
    assert.equal(read(`${PLUGIN}/.mcp.json`).mcpServers[kit.mcp.name].url, kit.mcp.url, "the source is untouched");
  } finally {
    rmSync(join(out, ".."), { recursive: true, force: true });
  }
  const refused = spawnSync(process.execPath, [join(ROOT, "scripts/build.mjs"), "--mcp-url", "http://x/mcp"],
    { encoding: "utf8" });
  assert.notEqual(refused.status, 0, "--mcp-url without --out must be refused");
});

test("the kit is MIT licensed and the plugin ships the license", () => {
  assert.match(readFileSync(join(ROOT, "LICENSE"), "utf8"), /^MIT License/);
  assert.match(readFileSync(join(ROOT, "plugins/valendata/LICENSE"), "utf8"), /^MIT License/);
});
