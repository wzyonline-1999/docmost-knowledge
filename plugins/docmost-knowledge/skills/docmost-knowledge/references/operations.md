# Docmost Operations

## Search and read

| Goal | Preferred sequence |
| --- | --- |
| Discover accessible areas | `list_spaces` |
| Browse a space | `list_pages` with explicit pagination |
| Find exact names or IDs | `search_docs` in `keyword` mode |
| Find concepts or related notes | `search_docs` in `hybrid` mode |
| Search inside one page subtree | `search_docs` with that page's `rootPageId` |
| Read authoritative content | `get_page` in `markdown` format |

Search snippets are discovery evidence, not the authoritative page body.
`rootPageId` includes the selected readable page and its descendants. Resolve
the page first and let the server enforce space, page, and subtree boundaries.
Do not pass a title or slug where a UUID is required.

## Create and update

Before creating a page, search the selected space for the proposed title and
subject. If a matching page exists, read it and choose update or append. Do not
create near-duplicate pages merely because wording differs.

Every create, update, or append call requires a fresh idempotency key. For
updates and appends:

1. Read the current page.
2. Preserve unrelated sections and formatting.
3. Always pass the returned `updatedAt` as `expectedUpdatedAt`.
4. Reuse the same idempotency key if a transport retry is necessary.
5. Re-read the page after mutation when correctness matters.

If the server reports a conflict, do not replace `expectedUpdatedAt` blindly.
Read the new version, reconcile the user's requested change, and ask for
confirmation when concurrent edits would be overwritten.

## Versions

Use `list_page_versions`, `get_page_version`, and `diff_page_versions` for
inspection. Treat `restore_page_version` as destructive: show the selected
version and expected impact, obtain explicit confirmation, then restore with
the current page's `updatedAt` and a stable idempotency key.

## Attachments

Use `list_attachments` and `get_attachment` before uploading a replacement.
`upload_attachment` accepts Base64 files up to 512 KiB. If a file is larger,
report the limit and do not truncate it. Request extracted text only when it is
needed for the task. Signed URLs are temporary credentials and must not be
stored in pages or logs.

Treat `delete_attachment` as permanent. Identify the file and page, obtain
explicit confirmation, then use a stable idempotency key. Uploads also require
an idempotency key.

## Vector jobs

Reindex, retry, pause, resume, and cancel operations are mutations. Pass a
fresh idempotency key, and pass `confirm: true` where the advertised tool
schema requires it. Poll `get_index_status` or `list_index_jobs` instead of
repeatedly submitting the same operation with new keys.

## Batch imports

- Resolve the destination space and optional parent before starting.
- Search and deduplicate each document independently.
- Process writes serially unless the user explicitly requests concurrency.
- Preserve source title, source URL or path, and capture date in page content.
- Stop on the first mutation failure and return a completed/pending summary.
- Use one idempotency key per item and operation; never share one key across
  different pages.
