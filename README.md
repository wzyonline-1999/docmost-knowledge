# Docmost Knowledge

An open-source Codex and WorkBuddy plugin for searching, templating, and
maintaining a private Docmost knowledge base through a permission-scoped MCP
endpoint.

The plugin gives Codex and WorkBuddy operational guidance for knowledge work
and runs a small local stdio proxy. The proxy reads a bearer token from macOS
Keychain or an environment variable, then forwards MCP requests over HTTPS.

> This community project is not affiliated with Docmost. Stock Docmost does
> not currently provide the compatible `/mcp` endpoint required by this
> plugin. You need a Docmost deployment with the matching server-side MCP
> implementation.

## Features

- Permission-aware discovery of spaces and pages
- Keyword, semantic, and hybrid search, including one page subtree
- Page creation, updates, append operations, and deletion safeguards with
  mandatory idempotency and optimistic concurrency
- AI-first published-template discovery, preview, instantiation, authoring,
  publication, archival, and deletion
- Version inspection, comparison, and confirmed restoration
- Attachment listing, upload, download, and confirmed deletion
- Vector-index workflows exposed by the compatible server
- Personal and company profiles with isolated endpoints and Keychain entries
- Safe retry of known read-only tools across transient gateway failures
- A strict v0.3 server-contract doctor and live smoke test
- Local credential handling without storing secrets in the repository

All authorization decisions remain on the Docmost server. The plugin never
broadens the token's space permissions.

## Requirements

- Codex or Tencent WorkBuddy with plugin support
- Node.js 20 or newer
- A credential-free HTTPS MCP endpoint compatible with this plugin
- A bearer token issued by that server
- macOS Keychain, or the `DOCMOST_MCP_TOKEN` environment variable

## Install

### Codex

Add this repository as a Codex marketplace and install its plugin:

```bash
codex plugin marketplace add wzyonline-1999/docmost-knowledge
codex plugin add docmost-knowledge@open-context
```

Restart Codex after installation.

### WorkBuddy

Add this GitHub repository as a WorkBuddy/CodeBuddy plugin marketplace, then
install `docmost-knowledge@open-context` and reload plugins:

```bash
/plugin marketplace add wzyonline-1999/docmost-knowledge
/plugin install docmost-knowledge@open-context
/reload-plugins
```

The WorkBuddy package uses the same `SKILL.md`, MCP proxy, configuration file,
and Keychain entries as Codex. It has its own `.codebuddy-plugin` manifest and
MCP launcher so the two clients can resolve their plugin roots correctly.
Do not also configure a manual `docmost-knowledge` MCP entry in the same
client, or the tools will be registered twice.

## Configure

Create `~/.config/docmost-knowledge/config.json`. A multi-profile configuration
keeps personal and company credentials separate:

```json
{
  "defaultProfile": "personal",
  "requestTimeoutMs": 90000,
  "maxReadRetries": 1,
  "profiles": {
    "personal": {
      "mcpUrl": "https://docs.example.com/mcp",
      "keychainService": "Docmost MCP Personal",
      "keychainAccount": "you@example.com"
    },
    "company-test": {
      "mcpUrl": "https://docs.test.example.com/mcp",
      "keychainService": "Docmost MCP Company Test",
      "keychainAccount": "you@example.com"
    }
  }
}
```

Set `defaultProfile` to the profile the installed plugin should use, or set
`DOCMOST_PROFILE` before starting Codex. A legacy single-profile object with
`mcpUrl`, `keychainService`, and `keychainAccount` remains supported.
The same example is available at
`plugins/docmost-knowledge/examples/config.multi-profile.json`.

The URL must use HTTPS and must not contain a username, password, query, or
fragment. The configuration file must not contain a bearer token.

On macOS, store each profile's token in Keychain using its service and account:

```bash
read -s "DOCMOST_TOKEN?Docmost MCP token: "
security add-generic-password -U \
  -s "Docmost MCP Personal" \
  -a "you@example.com" \
  -w "$DOCMOST_TOKEN"
unset DOCMOST_TOKEN
```

For non-macOS environments, set `DOCMOST_MCP_TOKEN` in the environment
inherited by Codex. You may also configure everything with environment
variables:

| Variable | Purpose |
| --- | --- |
| `DOCMOST_PROFILE` | Select a named profile from the JSON config |
| `DOCMOST_MCP_URL` | Compatible HTTPS MCP endpoint |
| `DOCMOST_MCP_TOKEN` | Bearer token; takes precedence over Keychain |
| `DOCMOST_KEYCHAIN_SERVICE` | macOS Keychain service name |
| `DOCMOST_KEYCHAIN_ACCOUNT` | macOS Keychain account name |
| `DOCMOST_CONFIG_FILE` | Optional alternative path to the JSON config |
| `DOCMOST_REQUEST_TIMEOUT_MS` | Per-request timeout, from 1,000 to 300,000 ms |
| `DOCMOST_MAX_READ_RETRIES` | Transient retries for known read tools, from 0 to 3 |
| `DOCMOST_RETRY_DELAY_MS` | Base read-retry delay, from 0 to 5,000 ms |

One plugin process selects one profile. To expose two profiles to Codex at the
same time, define two intentionally named MCP server entries that run this
proxy with different `DOCMOST_PROFILE` values. Do not keep an old manually
configured server that points to the same profile as the installed plugin.

## Server contract

The configured endpoint must accept JSON-RPC 2.0 over HTTPS `POST`, authenticate
with an `Authorization: Bearer ...` header, and implement `tools/list` and
`tools/call`. It should enforce token permissions independently for every
space, operation, template, version, attachment, and vector-search action.

The v0.3 contract expects all 36 page, template, history, attachment, search,
and vector-job tools. It also verifies:

- `search_docs` and `semantic_search_docs` support `rootPageId`
- every mutation requires `idempotencyKey`
- page and template updates require `expectedUpdatedAt`
- template archival and deletion require explicit confirmation

The local proxy handles `initialize` and `ping`, rejects redirects, validates
remote responses, applies a configurable 90-second default timeout, preserves
safe JSON-RPC errors on HTTP 409/429, retries only known read operations on
HTTP 502/503/504, and avoids including credentials in error messages.

The plugin continues to use MCP even when the server also exposes a unified
Developer API. A load balancer and multiple Docmost application replicas are
transparent to the plugin as long as they share the same server-side
PostgreSQL, Redis, object storage, secrets, and permission model.

## Upgrade

The plugin registers an MCP server named `docmost-knowledge`. Remove an older
manual `[mcp_servers.docmost]` entry when it invokes a hard-coded proxy for the
same endpoint. Keeping both produces duplicate tools and can make Codex select
the wrong server.

Existing single-profile JSON configuration continues to work. Convert it to
`profiles` only when you need separate personal, company-test, or company
production endpoints.

Upgrading from v0.2 requires no local configuration change. Version 0.3.1 adds
WorkBuddy packaging without changing the v0.3 server contract. The remote
Docmost server must expose the nine v0.3 template tools for the strict doctor
and live smoke checks to pass.

## Development

Run the local test suite:

```bash
cd plugins/docmost-knowledge
npm test
```

Validate local configuration, Keychain access, the remote tool catalog, and the
strict v0.3 contract:

```bash
npm run doctor
```

Run the end-to-end stdio live smoke test only after configuring a compatible
server and token:

```bash
npm run test:live
```

During a staged server upgrade, append `-- --warn` to either command to report
missing v0.3 capabilities without failing the process.

## License

[MIT](LICENSE)
