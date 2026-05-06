---
'flowpunk': minor
---

Add OAuth 2.1 / MCP authorization with RFC 7591 DCR. Indie now ships a standalone OAuth server (register, authorize, approve, token, revoke + RFC 9728/8414 well-knowns) so Claude.ai web and ChatGPT custom connectors can connect via Dynamic Client Registration. New tenant-D1 migrations 0009–0012 add `mcp_oauth_*` tables. See [ADR-019](../../managed/docs/architecture/ADR-019-oauth-indie-and-managed.md).

**Upgrade note for existing operators:** This release introduces a new `OAUTH_TOKEN_CACHE` KV namespace bound by both the gateway and users services. `flowpunk update` alone will NOT create the namespace on existing deployments — operators upgrading from a pre-OAuth `flowpunk` version must either (a) re-run `flowpunk init` so the new namespace is provisioned, or (b) manually create a KV namespace via Cloudflare and patch the deployment state file. Fresh `flowpunk init` runs are unaffected: the namespace is created automatically alongside the existing six.
