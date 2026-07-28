# Changelog

## 0.2.0 - 2026-07-28

- Added named personal and company profiles with isolated endpoints and
  Keychain entries.
- Added strict compatibility checks for the full 27-tool Docmost MCP contract.
- Added directory-scoped search guidance through `rootPageId`.
- Updated mutation guidance for mandatory idempotency keys and optimistic
  versions.
- Increased the default request timeout to 90 seconds and made transport
  settings configurable.
- Added safe retries for known read-only tools on transient gateway failures.
- Preserved bounded JSON-RPC errors for HTTP conflict and rate-limit responses.
- Added `doctor` and stricter end-to-end live smoke checks.
- Documented migration away from duplicate manually configured MCP servers.
