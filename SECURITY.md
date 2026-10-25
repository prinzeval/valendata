# Security

Please report a vulnerability privately to **info@valendata.com** with "Security" in the subject, not in a public issue. Include what you found, how to reproduce it, and what it could expose.

This kit never stores a password or an API key. The install script writes the *name* of an environment variable to your agent's config, never its value, and the MCP server signs you in through the browser with OAuth. A skill that signs in to a website uses the login saved in your Valendata account; the login never passes through the agent.
