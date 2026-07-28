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
   recall. When the user names a page subtree or directory, resolve its page ID
   and pass it as `rootPageId`; do not imitate directory scoping with title
   keywords.
3. Read the selected page with `get_page` in Markdown. Do not infer missing
   content from snippets.
4. For answers based on Docmost, cite the page title and returned page ID or
   slug. Link only when the tool returned a trustworthy URL.
5. Write only when the user asks to capture or change knowledge. Reuse an
   existing page when it represents the same subject.

## Write safety

- Read the current page immediately before `update_page` or `append_page`, and
  always pass its `updatedAt` as `expectedUpdatedAt`. A missing or stale value
  is a conflict that requires a fresh read, not a reason to bypass protection.
- Generate one non-empty idempotency key for every mutation, including create,
  update, append, delete, restore, attachment, and reindex operations. Reuse it
  only for retries of that exact logical mutation.
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
- On a version conflict, re-read the page and ask before overwriting materially
  changed content. On rate limiting, wait for the indicated retry window.
- Never silently truncate content or attachments.

Read [operations.md](references/operations.md) before mutations, version
operations, attachment work, or multi-page imports.
