#!/bin/sh
# Install Valendata in Claude Code, Codex or Cursor: the Valendata MCP server and the
# Valendata skill. Sign-in happens in the browser (OAuth) the first time the host connects.
#
#   curl -fsSL https://raw.githubusercontent.com/prinzeval/valendata/main/scripts/install.sh | sh -s -- claude
#
# usage: install.sh <claude|codex|cursor|skill|all> [--api-key-env NAME] [--dry-run]
#
#   claude   Claude Code: adds the kit as a plugin marketplace and installs the plugin
#            (with --api-key-env, or without the claude command: the MCP server and the skill)
#   codex    Codex: [mcp_servers.valendata] in config.toml, and the skill
#   cursor   Cursor: "valendata" in mcp.json, and the skill
#   skill    only the skill, in ~/.agents/skills (read by Codex, Cursor and other agents)
#   all      claude, codex and cursor
#
#   --api-key-env NAME  sign in with the API key in environment variable NAME instead of
#                       OAuth. Only the variable's name is written to the config, never the key.
#   --dry-run           print what would change, change nothing
#
# Environment (all optional):
#   VALENDATA_MCP_URL     MCP server (default https://api.valendata.com/mcp)
#   VALENDATA_KIT_SOURCE  where Claude Code gets the plugin (default prinzeval/valendata;
#                         a local path works)
#   VALENDATA_KIT_TARBALL where to download the skill when not run from a checkout
#   CLAUDE_CONFIG_DIR     Claude Code's config folder (default ~/.claude)
#   CODEX_HOME            Codex's config folder (default ~/.codex)
#   CURSOR_CONFIG_DIR     Cursor's config folder (default ~/.cursor)
#   AGENTS_SKILLS_DIR     shared skills folder (default ~/.agents/skills)

set -eu

DEFAULT_URL="https://api.valendata.com/mcp"
MCP_URL="${VALENDATA_MCP_URL:-$DEFAULT_URL}"
KIT_SOURCE="${VALENDATA_KIT_SOURCE:-prinzeval/valendata}"
KIT_TARBALL="${VALENDATA_KIT_TARBALL:-https://codeload.github.com/prinzeval/valendata/tar.gz/refs/heads/main}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
CURSOR_DIR="${CURSOR_CONFIG_DIR:-$HOME/.cursor}"
SHARED_SKILLS="${AGENTS_SKILLS_DIR:-$HOME/.agents/skills}"
SERVER="valendata"
SKILL="valendata"

HOST=""
KEY_ENV=""
DRY_RUN=""
TEMP_DIR=""
SKILL_SRC=""

log() { printf '%s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }
say() { printf '%s\n' "$*"; }

cleanup() {
	if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then rm -rf "$TEMP_DIR"; fi
}
trap cleanup EXIT HUP INT TERM

usage() {
	cat <<'EOF_USAGE'
usage: install.sh <claude|codex|cursor|skill|all> [--api-key-env NAME] [--dry-run]

  claude   Claude Code: the Valendata plugin (MCP server and skill)
  codex    Codex: [mcp_servers.valendata] in config.toml, and the skill
  cursor   Cursor: "valendata" in mcp.json, and the skill
  skill    only the skill, in ~/.agents/skills
  all      claude, codex and cursor

  --api-key-env NAME  use the API key in environment variable NAME instead of the
                      browser sign-in; only the name is written, never the key
  --dry-run           print what would change, change nothing
EOF_USAGE
	exit "${1:-0}"
}

while [ $# -gt 0 ]; do
	case "$1" in
		claude | codex | cursor | skill | all)
			[ -z "$HOST" ] || die "choose one host"
			HOST="$1"
			;;
		--api-key-env)
			[ $# -ge 2 ] || die "--api-key-env needs a variable name"
			KEY_ENV="$2"
			shift
			;;
		--dry-run) DRY_RUN=1 ;;
		-h | --help) usage 0 ;;
		*) die "unknown argument: $1 (try --help)" ;;
	esac
	shift
done
[ -n "$HOST" ] || usage 1

case "$KEY_ENV" in
	"") ;;
	*[!A-Za-z0-9_]* | [0-9]*) die "--api-key-env takes a variable name such as VALENDATA_API_KEY" ;;
esac
case "$MCP_URL" in
	https://* | http://localhost:* | http://localhost/* | http://127.0.0.1:* | http://127.0.0.1/*) ;;
	*) die "VALENDATA_MCP_URL must be https (or http on localhost): $MCP_URL" ;;
esac
case "$MCP_URL" in
	*\"* | *\\* | *" "*) die "VALENDATA_MCP_URL has a character it cannot have: $MCP_URL" ;;
esac

run() {
	if [ -n "$DRY_RUN" ]; then
		say "would run: $*"
	else
		"$@"
	fi
}

# The skill: from this checkout when the script runs from one, else downloaded.
find_skill() {
	[ -z "$SKILL_SRC" ] || return 0
	here=$(dirname "$0")
	# Only a script file run from a checkout has a checkout next to it; `curl | sh` has none.
	if [ "${0##*/}" = "install.sh" ] && [ -f "$here/../skills/$SKILL/SKILL.md" ]; then
		SKILL_SRC=$(cd "$here/../skills/$SKILL" && pwd)
		return 0
	fi
	command -v curl >/dev/null 2>&1 || die "curl is needed to download the skill"
	command -v tar >/dev/null 2>&1 || die "tar is needed to unpack the skill"
	TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/valendata-kit.XXXXXX")
	curl -fsSL "$KIT_TARBALL" | tar -xz -C "$TEMP_DIR"
	for dir in "$TEMP_DIR"/*/skills/"$SKILL"; do
		if [ -f "$dir/SKILL.md" ]; then
			SKILL_SRC="$dir"
			return 0
		fi
	done
	die "the download has no skills/$SKILL/SKILL.md"
}

install_skill() {
	find_skill
	dest="$1/$SKILL"
	if [ -n "$DRY_RUN" ]; then
		say "would copy the skill to $dest"
		return 0
	fi
	mkdir -p "$1"
	rm -rf "$dest"
	cp -R "$SKILL_SRC" "$dest"
	say "Skill: $dest"
}

# Adds mcpServers.valendata to a JSON config, keeping everything else. An entry that is
# already there is left as it is.
merge_json() {
	file="$1"
	entry="$2"
	if [ -n "$DRY_RUN" ]; then
		say "would add \"$SERVER\" to $file: $entry"
		return 0
	fi
	mkdir -p "$(dirname "$file")"
	if command -v node >/dev/null 2>&1; then
		node -e '
const fs = require("fs");
const [file, name, entry] = process.argv.slice(1);
let config = {};
if (fs.existsSync(file) && fs.readFileSync(file, "utf8").trim()) config = JSON.parse(fs.readFileSync(file, "utf8"));
config.mcpServers = config.mcpServers || {};
if (config.mcpServers[name]) { console.log(`Already in ${file}: "${name}" (left as it is)`); process.exit(0); }
config.mcpServers[name] = JSON.parse(entry);
fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
console.log(`MCP server: "${name}" added to ${file}`);
' "$file" "$SERVER" "$entry"
	elif command -v python3 >/dev/null 2>&1; then
		python3 -c '
import json, os, sys
file, name, entry = sys.argv[1:4]
config = {}
if os.path.exists(file) and open(file).read().strip():
    config = json.load(open(file))
servers = config.setdefault("mcpServers", {})
if name in servers:
    print(f"Already in {file}: \"{name}\" (left as it is)"); sys.exit(0)
servers[name] = json.loads(entry)
open(file, "w").write(json.dumps(config, indent=2) + "\n")
print(f"MCP server: \"{name}\" added to {file}")
' "$file" "$SERVER" "$entry"
	else
		die "node or python3 is needed to edit $file"
	fi
}

install_claude() {
	say "== Claude Code"
	if [ -z "$KEY_ENV" ] && [ "$MCP_URL" = "$DEFAULT_URL" ] && command -v claude >/dev/null 2>&1; then
		# The plugin carries the MCP server and the skill, and updates with the kit.
		# A marketplace that is already added is refreshed instead.
		run claude plugin marketplace add "$KIT_SOURCE" || run claude plugin marketplace update valendata
		run claude plugin install "$SKILL@valendata"
		say "Next: start Claude Code, run /mcp, pick plugin:valendata:valendata and choose Authenticate."
		return 0
	fi
	if [ -n "$KEY_ENV" ]; then
		entry="{\"type\":\"http\",\"url\":\"$MCP_URL\",\"headers\":{\"Authorization\":\"Bearer \${$KEY_ENV}\"}}"
	else
		entry="{\"type\":\"http\",\"url\":\"$MCP_URL\"}"
	fi
	if command -v claude >/dev/null 2>&1; then
		run claude mcp add-json --scope user "$SERVER" "$entry"
	else
		log "The claude command is not on PATH. In Claude Code, run:"
		log "  claude mcp add-json --scope user $SERVER '$entry'"
	fi
	install_skill "$CLAUDE_DIR/skills"
	if [ -n "$KEY_ENV" ]; then
		say "Next: set $KEY_ENV in the shell that starts Claude Code, then run /mcp to check valendata."
	else
		say "Next: start Claude Code, run /mcp, pick valendata and choose Authenticate."
	fi
}

install_codex() {
	say "== Codex"
	file="$CODEX_DIR/config.toml"
	if [ -f "$file" ] && grep -q "^\[mcp_servers\.$SERVER\]" "$file"; then
		say "Already in $file: [mcp_servers.$SERVER] (left as it is)"
	elif [ -n "$DRY_RUN" ]; then
		say "would add [mcp_servers.$SERVER] url = \"$MCP_URL\" to $file"
	else
		mkdir -p "$CODEX_DIR"
		{
			[ ! -s "$file" ] || printf '\n'
			printf '[mcp_servers.%s]\nurl = "%s"\n' "$SERVER" "$MCP_URL"
			[ -z "$KEY_ENV" ] || printf 'bearer_token_env_var = "%s"\n' "$KEY_ENV"
		} >>"$file"
		say "MCP server: [mcp_servers.$SERVER] added to $file"
	fi
	install_skill "$SHARED_SKILLS"
	if [ -n "$KEY_ENV" ]; then
		say "Next: set $KEY_ENV in the shell that starts Codex."
	else
		say "Next: run \`codex mcp login $SERVER\` and sign in to Valendata in the browser."
	fi
}

install_cursor() {
	say "== Cursor"
	if [ -n "$KEY_ENV" ]; then
		entry="{\"url\":\"$MCP_URL\",\"headers\":{\"Authorization\":\"Bearer \${env:$KEY_ENV}\"}}"
	else
		entry="{\"url\":\"$MCP_URL\"}"
	fi
	merge_json "$CURSOR_DIR/mcp.json" "$entry"
	install_skill "$CURSOR_DIR/skills"
	if [ -n "$KEY_ENV" ]; then
		say "Next: set $KEY_ENV in the environment Cursor starts from, then restart Cursor."
	else
		say "Next: open Cursor Settings > Tools & MCP and click Connect next to valendata."
	fi
}

case "$HOST" in
	claude) install_claude ;;
	codex) install_codex ;;
	cursor) install_cursor ;;
	skill) install_skill "$SHARED_SKILLS" ;;
	all)
		install_claude
		install_codex
		install_cursor
		;;
esac
