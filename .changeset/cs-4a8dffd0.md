---
'flowpunk': minor
---

Add OAuth 2.1 / MCP authorization with RFC 7591 DCR. Indie now ships a standalone OAuth server (register, authorize, approve, token, revoke + RFC 9728/8414 well-knowns) so Claude.ai web and ChatGPT custom connectors can connect via Dynamic Client Registration. New `OAUTH_TOKEN_CACHE` KV binding required; new tenant-D1 migrations 0009–0012 add `mcp_oauth_*` tables. See ADR-019.
