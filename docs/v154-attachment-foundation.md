# v1.54 Attachment Persistence Audit / Foundation

## Purpose

This release does not attempt to finish the full attachment feature. It records and tests the current attachment boundary so future work does not accidentally treat the current browser UI as a complete file attachment implementation.

Attachments were already designed before v1.54. The accepted model remains:

```text
Budget package
├── budget.db                    SQLite data and attachment metadata
└── Attachments/                 Actual attachment files
```

The database stores attachment metadata. Attachment file content lives outside SQLite in the budget package `Attachments/` folder.

## Current State

### Implemented foundation

The codebase already contains:

- `transaction_attachments` SQLite table.
- `TransactionAttachmentRepository` and SQLite implementation.
- `AttachmentApplicationService` for attaching file content to a budget package folder.
- `AttachmentManager` in `packages/budget-file` for package-level attachment file handling.
- Backup/package documentation that includes `Attachments/`.
- Existing tests for attachment metadata, integrity, storage usage, and budget package attachment behaviour.
- Register UI with attachment indicators and an attachment dialog.

### Current browser UI limitation

The current web/register attachment UI is metadata-only.

When a file is selected in the browser register, the app records:

- file name
- file size
- mime type
- attached timestamp

It does **not** persist the actual file bytes through the browser register service.

This means the attachment appears in the register UI, but it is not yet a complete durable attachment implementation.

### SQLite/runtime limitation

The SQLite account register persistence adapter still deliberately rejects attachment mutation.

Current behaviour:

```text
addAttachment/removeAttachment -> throws unsupported attachment mutation error
```

This is intentional until the runtime file-content pathway is wired safely.

## Explicit Non-Goals for v1.54

v1.54 does not implement:

- opening attachments
- downloading attachments
- image/PDF preview
- storing browser-selected file bytes into the budget package
- desktop/Tauri file bridge
- attachment encryption
- attachment sync conflict handling

Open/download should not be added until the storage path is real and path-safe.

## Required Future Work

A future attachment implementation should add:

1. A file-content persistence boundary for browser/desktop attachment writes.
2. Runtime adapter support for adding/removing attachment files and metadata together.
3. UI validation for file size and allowed file types.
4. Safe open/download behaviour.
5. Clear error messages when attachment persistence is unavailable.
6. Tests covering browser UI, runtime adapter, backup/restore, and path-safety behaviour.

## Test Command

```bash
pnpm test:v154
```

## Build Command

```bash
pnpm --filter @budget-app/web build
```

## Release Status

v1.54 should be treated as an audit/foundation checkpoint, not as a finished attachment feature.
