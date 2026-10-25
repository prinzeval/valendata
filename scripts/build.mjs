#!/usr/bin/env node
// Builds every host manifest and the packaged plugin from one source: kit.json and
// skills/valendata.
//
//   node scripts/build.mjs                      write the generated files in place
//   node scripts/build.mjs --check              exit 1 if any generated file is out of date
//   node scripts/build.mjs --out DIR [--mcp-url URL]
//                                               write a full copy of the kit to DIR, pointed
//                                               at another MCP server (local testing)

import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = "valendata";
// Copied as they are into a full copy made with --out.
const COPIED = ["skills", "scripts", "tests", "README.md", "LICENSE", "package.json", ".gitignore"];

function usage() {
  return "Usage: node scripts/build.mjs [--check] [--out DIR] [--mcp-url URL]";
}

function parseArguments(args) {
  const options = { check: false, out: null, mcpUrl: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--out" || argument === "--mcp-url") {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} needs a value`);
      options[argument === "--out" ? "out" : "mcpUrl"] = value;
      index += 1;
    } else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argument}\n${usage()}`);
  }
  if (options.check && options.out) throw new Error("--check and --out do not go together");
  if (options.mcpUrl && !options.out) throw new Error("--mcp-url needs --out: the checked-in kit always points at production");
  return options;
}

/** A packaged plugin holds real files only: a symbolic link under `root` (or `root` itself)
 *  would point outside the package on the user's machine, so the build stops on one. */
async function refuseSymlinks(root, label) {
  const found = [];
  if ((await lstat(root)).isSymbolicLink()) found.push(root);
  else {
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (entry.isSymbolicLink()) found.push(join(entry.parentPath ?? entry.path, entry.name));
    }
  }
  if (found.length) throw new Error(`${label} contains a symbolic link: ${found.join(", ")}`);
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else files.push(path);
  }
  return files.sort();
}

/** A manifest's file text: two-space JSON with a final newline, like every other file here. */
function json(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

/** Every generated file, as { path relative to the kit root: Buffer | string }. */
export async function generatedFiles(kit, mcpUrl = kit.mcp.url) {
  const plugin = `plugins/${kit.name}`;
  const identity = {
    name: kit.name,
    version: kit.version,
    description: kit.description,
    author: kit.author,
    homepage: kit.homepage,
    repository: kit.repository,
    license: kit.license,
    keywords: kit.keywords,
  };
  const pluginEntry = { name: kit.name, description: kit.description };
  const files = {
    // Claude Code marketplace (also read by the ChatGPT desktop app as a legacy location).
    ".claude-plugin/marketplace.json": json({
      name: kit.marketplace.name,
      owner: kit.author,
      metadata: { description: kit.marketplace.description },
      plugins: [{ ...pluginEntry, source: `./${plugin}`, category: "productivity" }],
    }),
    // Codex marketplace.
    ".agents/plugins/marketplace.json": json({
      name: kit.marketplace.name,
      interface: { displayName: kit.marketplace.displayName },
      plugins: [{
        name: kit.name,
        source: { source: "local", path: `./${plugin}` },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: kit.codex.category,
      }],
    }),
    // Cursor multi-plugin repository manifest.
    ".cursor-plugin/marketplace.json": json({
      name: kit.marketplace.name,
      owner: { name: kit.author.name, email: kit.author.email },
      metadata: { description: kit.marketplace.description, version: kit.version },
      plugins: [{ ...pluginEntry, version: kit.version, source: plugin }],
    }),
    // Agent Plugins 1.0.0 (portable): Codex, Cursor and other hosts that read the standard.
    [`${plugin}/plugin.json`]: json({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      ...identity,
    }),
    [`${plugin}/mcp.json`]: json({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { [kit.mcp.name]: { type: "streamable-http", url: mcpUrl } },
    }),
    // Claude Code reads .mcp.json at the plugin root; the Codex overlay points at it too.
    // No headers: the host finds the OAuth sign-in from the server's 401.
    [`${plugin}/.mcp.json`]: json({ mcpServers: { [kit.mcp.name]: { type: "http", url: mcpUrl } } }),
    // No displayName: Claude Code 2.1.63 (the oldest version tested) refuses it here.
    [`${plugin}/.claude-plugin/plugin.json`]: json(identity),
    [`${plugin}/.codex-plugin/plugin.json`]: json({
      ...identity,
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      interface: kit.codex.interface,
    }),
    // Cursor plugin format: the server inline, in Cursor's own mcp.json shape.
    [`${plugin}/.cursor-plugin/plugin.json`]: json({
      ...identity,
      displayName: kit.marketplace.displayName,
      logo: "assets/logo.png",
      skills: "./skills/",
      mcpServers: { [kit.mcp.name]: { url: mcpUrl } },
    }),
  };

  // The packaged plugin carries real copies (hosts copy plugins into a cache, so a link out
  // of the plugin folder would break): the skill, its icons, the license and notice.
  const skillRoot = join(ROOT, "skills", SKILL);
  await refuseSymlinks(skillRoot, `Skill ${SKILL}`);
  for (const file of await listFiles(skillRoot)) {
    const rel = relative(skillRoot, file);
    const content = await readFile(file);
    files[`${plugin}/skills/${SKILL}/${rel}`] = content;
    if (rel.startsWith("assets/")) files[`${plugin}/${rel}`] = content;
  }
  files[`${plugin}/LICENSE`] = await readFile(join(ROOT, "LICENSE"));
  files[`${plugin}/README.md`] =
    `# ${kit.marketplace.displayName} plugin\n\n` +
    "This folder is built by `node scripts/build.mjs` from `kit.json` and `skills/valendata/`. " +
    "Do not edit it by hand.\n\nInstall lines for each host are in the README at the root of this repository.\n";
  return files;
}

async function readIfPresent(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function write(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return console.log(usage());
  const kit = JSON.parse(await readFile(join(ROOT, "kit.json"), "utf8"));
  if (options.mcpUrl && !/^https?:\/\/[^\s]+$/.test(options.mcpUrl)) throw new Error(`Not a URL: ${options.mcpUrl}`);
  const files = await generatedFiles(kit, options.mcpUrl ?? kit.mcp.url);
  const packaged = join(ROOT, "plugins", kit.name);

  if (options.check) {
    const stale = [];
    for (const [path, content] of Object.entries(files)) {
      const current = await readIfPresent(join(ROOT, path));
      if (!current || !current.equals(Buffer.from(content))) stale.push(path);
    }
    // A file in the packaged plugin that the build does not make is stale too.
    let existing = [];
    try {
      existing = await listFiles(packaged);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    for (const file of existing) {
      if (!(relative(ROOT, file) in files)) stale.push(relative(ROOT, file));
    }
    if (stale.length) throw new Error(`Out of date, run node scripts/build.mjs:\n  ${stale.join("\n  ")}`);
    return console.log(`Up to date: ${Object.keys(files).length} generated files.`);
  }

  if (options.out) {
    const out = resolve(options.out);
    if (out === ROOT || out.startsWith(`${ROOT}/`)) throw new Error("--out must be outside the kit");
    await rm(out, { recursive: true, force: true });
    for (const name of [...COPIED, "kit.json"]) {
      await cp(join(ROOT, name), join(out, name), { recursive: true });
    }
    await write(out, files);
    return console.log(`Wrote the kit to ${out} (MCP server ${options.mcpUrl ?? kit.mcp.url}).`);
  }

  await rm(packaged, { recursive: true, force: true });
  await write(ROOT, files);
  console.log(`Wrote ${Object.keys(files).length} generated files.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`build: ${error.message}`);
    process.exitCode = 1;
  });
}
