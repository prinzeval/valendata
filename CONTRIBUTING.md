# Contributing

Thanks for helping. This repository is the Valendata skill and its packaging for Claude Code, Codex, Cursor and hosts that read Agent Skills or Agent Plugins. The Valendata service itself is not in it.

## Good first contributions

- A clearer instruction in [`skills/valendata/SKILL.md`](skills/valendata/SKILL.md), when you saw an agent take a wrong turn. Say which agent and what it did.
- A new example in [`examples/`](examples/): a prompt, or a short script for an SDK or tool.
- Support for another agent host in [`scripts/install.sh`](scripts/install.sh) and the manifests.
- A site that doesn't work on Valendata: open an issue with the site and what you need from it.

## Making a change

1. Edit the source: `skills/valendata/` for the skill, `kit.json` for names, versions and listing text. Never edit `plugins/valendata/` by hand; it is built.
2. `npm run build` regenerates every manifest and the packaged plugin.
3. `npm test` checks that the manifests agree, that the skill names only tools the server has, and that the install script works. Node 20 or newer, no dependencies.
4. Open a pull request saying what changed and why.

## Style for the skill

Short sentences, plain words. Tell the agent what to do and when to stop and ask. Name only tools the Valendata MCP server lists (`tests/fixtures/mcp-tools.json`). The server's own tool descriptions win when they disagree with the skill.
