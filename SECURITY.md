# Security Policy

## Reporting a vulnerability

Please report security issues through GitHub Private Vulnerability Reporting
for this repository. Do not open a public issue containing tokens, private
Docmost URLs, page contents, signed attachment URLs, or authorization headers.

Include the affected version, impact, reproduction steps, and any suggested
mitigation. Remove all real credentials and private knowledge-base content
from examples.

## Credential model

- Bearer tokens are read from macOS Keychain or `DOCMOST_MCP_TOKEN`.
- Tokens must never be committed to this repository or stored in the JSON
  configuration file.
- The proxy accepts only credential-free HTTPS URLs and rejects redirects.
- Space and operation permissions must be enforced by the remote MCP server.

Revoke the server-side token immediately if you suspect it has been exposed.
