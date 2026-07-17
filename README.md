# Docmost Knowledge

An open-source Codex plugin for searching and maintaining a private Docmost
knowledge base through a permission-scoped MCP endpoint.

The plugin gives Codex operational guidance for knowledge work and runs a
small local stdio proxy. The proxy reads a bearer token from macOS Keychain or
an environment variable, then forwards MCP requests over HTTPS.

> This community project is not affiliated with Docmost. Stock Docmost does
> not currently provide the compatible `/mcp` endpoint required by this
> plugin. You need a Docmost deployment with the matching server-side MCP
> implementation.

## Features

- Permission-aware discovery of spaces and pages
- Keyword, semantic, and hybrid search
- Page creation, updates, append operations, and deletion safeguards
- Version inspection, comparison, and confirmed restoration
- Attachment listing, upload, download, and confirmed deletion
- Vector-index workflows exposed by the compatible server
- Local credential handling without storing secrets in the repository

All authorization decisions remain on the Docmost server. The plugin never
broadens the token's space permissions.

## Requirements

- Codex with plugin support
- Node.js 20 or newer
- A credential-free HTTPS MCP endpoint compatible with this plugin
- A bearer token issued by that server
- macOS Keychain, or the `DOCMOST_MCP_TOKEN` environment variable

## Install

Add this repository as a Codex marketplace and install its plugin:

```bash
codex plugin marketplace add wzyonline-1999/docmost-knowledge
codex plugin add docmost-knowledge@docmost-knowledge
```

Restart Codex after installation.

## Configure

Create `~/.config/docmost-knowledge/config.json`:

```json
{
  "mcpUrl": "https://docs.example.com/mcp",
  "keychainService": "Docmost MCP",
  "keychainAccount": "you@example.com"
}
```

The URL must use HTTPS and must not contain a username, password, or fragment.
The configuration file contains no bearer token.

On macOS, store the token in Keychain using the same service and account:

```bash
read -s "DOCMOST_TOKEN?Docmost MCP token: "
security add-generic-password -U \
  -s "Docmost MCP" \
  -a "you@example.com" \
  -w "$DOCMOST_TOKEN"
unset DOCMOST_TOKEN
```

For non-macOS environments, set `DOCMOST_MCP_TOKEN` in the environment
inherited by Codex. You may also configure everything with environment
variables:

| Variable | Purpose |
| --- | --- |
| `DOCMOST_MCP_URL` | Compatible HTTPS MCP endpoint |
| `DOCMOST_MCP_TOKEN` | Bearer token; takes precedence over Keychain |
| `DOCMOST_KEYCHAIN_SERVICE` | macOS Keychain service name |
| `DOCMOST_KEYCHAIN_ACCOUNT` | macOS Keychain account name |
| `DOCMOST_CONFIG_FILE` | Optional alternative path to the JSON config |

## Server contract

The configured endpoint must accept JSON-RPC 2.0 over HTTPS `POST`, authenticate
with an `Authorization: Bearer ...` header, and implement `tools/list` and
`tools/call`. It should enforce token permissions independently for every
space, operation, version, attachment, and vector-search action.

The local proxy handles `initialize` and `ping`, rejects redirects, validates
remote responses, applies a 30-second transport timeout, and avoids including
credentials in error messages.

## Development

Run the local test suite:

```bash
cd plugins/docmost-knowledge
npm test
```

Run the live smoke test only after configuring a compatible server and token:

```bash
npm run test:live
```

## License

[MIT](LICENSE)
