---
name: docmost-knowledge
description: Use a private Docmost knowledge base through permission-scoped MCP tools. Trigger when the user asks to search, read, cite, capture, create, update, append, version, restore, attach, index, or organize knowledge in Docmost.
---

# Docmost Knowledge

Use the `docmost-knowledge` MCP server for Docmost work. Prefer it over browser
scraping or direct database access.

## Core workflow

1. Call `list_spaces` when the target space is not already established. Use
   only spaces returned by the server.
2. Search before reading or writing. Default to `search_docs` with `hybrid`
   mode; use `keyword` for exact identifiers and `semantic` for conceptual
   recall.
3. Read the selected page with `get_page` in Markdown. Do not infer missing
   content from snippets.
4. For answers based on Docmost, cite the page title and returned page ID or
   slug. Link only when the tool returned a trustworthy URL.
5. Write only when the user asks to capture or change knowledge. Reuse an
   existing page when it represents the same subject.

## Write safety

- Read the current page before `update_page`; pass its `updatedAt` as
  `expectedUpdatedAt` when available.
- Generate one idempotency key per mutation and reuse it for retries of that
  same mutation.
- Use `append_page` for journals and additive notes. Use `update_page` for a
  coherent replacement.
- Require explicit user confirmation immediately before page deletion,
  attachment deletion, page restoration, or version restoration. Pass
  `confirm: true` only after confirmation.
- Never broaden access or work around server-side space permissions.
- Do not ask the user to paste the bearer token. Authentication belongs in
  macOS Keychain.

## Failure behavior

- If the MCP server is unavailable, report whether the failure is local
  startup, Keychain authentication, transport, or server authorization. Do not
  expose credentials or raw authorization headers.
- Stop a batch after the first failed mutation. Report completed items and the
  exact item that failed before retrying.
- Never silently truncate content or attachments.

Read [operations.md](references/operations.md) before mutations, version
operations, attachment work, or multi-page imports.
