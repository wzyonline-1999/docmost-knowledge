# Docmost Operations

## Search and read

| Goal | Preferred sequence |
| --- | --- |
| Discover accessible areas | `list_spaces` |
| Browse a space | `list_pages` with explicit pagination |
| Find exact names or IDs | `search_docs` in `keyword` mode |
| Find concepts or related notes | `search_docs` in `hybrid` mode |
| Read authoritative content | `get_page` in `markdown` format |

Search snippets are discovery evidence, not the authoritative page body.

## Create and update

Before creating a page, search the selected space for the proposed title and
subject. If a matching page exists, read it and choose update or append. Do not
create near-duplicate pages merely because wording differs.

For updates:

1. Read the current page.
2. Preserve unrelated sections and formatting.
3. Pass optimistic concurrency data when returned.
4. Reuse the same idempotency key if a transport retry is necessary.
5. Re-read the page after mutation when correctness matters.

## Versions

Use `list_page_versions`, `get_page_version`, and `diff_page_versions` for
inspection. Treat `restore_page_version` as destructive: show the selected
version and expected impact, obtain explicit confirmation, then restore with
optimistic concurrency protection.

## Attachments

Use `list_attachments` and `get_attachment` before uploading a replacement.
`upload_attachment` accepts Base64 files up to 512 KiB. If a file is larger,
report the limit and do not truncate it. Request extracted text only when it is
needed for the task. Signed URLs are temporary credentials and must not be
stored in pages or logs.

Treat `delete_attachment` as permanent. Identify the file and page, obtain
explicit confirmation, then use a stable idempotency key.

## Batch imports

- Resolve the destination space and optional parent before starting.
- Search and deduplicate each document independently.
- Process writes serially unless the user explicitly requests concurrency.
- Preserve source title, source URL or path, and capture date in page content.
- Stop on the first mutation failure and return a completed/pending summary.
