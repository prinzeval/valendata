# Connect the Valendata tools

Read this when no `valendata` tools are listed, or when one you need is missing.

## No tools at all

The MCP server is `https://api.valendata.com/mcp` (Streamable HTTP). It signs in with OAuth in the browser: the host opens a Valendata page, the user signs in and ticks what the assistant may do. No key to paste.

Tell the user to finish sign-in for their host:

| Host | What to do |
| --- | --- |
| Claude Code | Run `/mcp`, pick `valendata`, choose **Authenticate**. |
| Codex | Run `codex mcp login valendata` in a terminal, then restart Codex. |
| Cursor | Open **Cursor Settings → Tools & MCP** and click **Connect** next to `valendata`. |

If the server is not listed at all, the kit is not installed. The install lines are at https://docs.valendata.com/ai-assistants/agent-kit.

## One tool is missing

The tools a connection sees follow the permissions the user ticked at sign-in. These are never ticked by default:

| Tools | Permission |
| --- | --- |
| `update_skill`, `delete_skill`, `schedule_skill` | `skills:write` |
| `create_workflow`, `update_workflow`, `delete_workflow`, `schedule_workflow` | `workflows:write` |
| `get_account`, `get_usage` | `account:read` |
| `list_apps`, `list_connected_apps`, `get_app`, `list_app_tools`, `read_from_app` | `apps:read` |
| `act_in_app`, `disconnect_app` | `apps:write` |
| follow-ups, background jobs, notes | `followups:*`, `jobs:*`, `notes:*` |

To add one, the user revokes the app in Valendata under **Settings → Connectors**, connects again, and ticks it.

## API key instead of OAuth

If the host cannot do the browser sign-in, the user can make an API key in Valendata under **Settings → API Keys** and send it as `Authorization: Bearer vd_sk_...`. The key carries the scopes picked when it was made. Never ask the user to paste the key into the chat: it belongs in their shell or host settings, as `VALENDATA_API_KEY`.
