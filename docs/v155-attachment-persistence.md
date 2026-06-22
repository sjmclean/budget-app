# v1.55 Attachment Persistence Completion

## Purpose

v1.54 documented that the browser register attachment workflow was metadata-only: adding an attachment stored the filename, size, and MIME type, but not the actual file content.

v1.55 completes the browser-side persistence foundation by storing attachment content with the register data while the desktop/package-backed attachment file store is still being wired into the web runtime.

## Current Behaviour

When a user attaches a supported file in the web register:

1. The file is read as a browser Data URL.
2. The attachment metadata and content payload are stored on the transaction attachment record.
3. The attachment survives register reloads because it is persisted through the existing account register persistence path.
4. Removing the attachment removes both metadata and the inline content payload.

This makes the browser prototype attachment flow real rather than metadata-only.

## Supported File Types

The web UI currently accepts:

- PDF
- JPEG
- PNG
- WEBP

Unsupported file types are rejected before mutation.

## File Size Limit

The current browser limit is 5 MB per attachment.

This is intentionally conservative because the browser runtime currently stores attachment content inline with register data. The limit should be reviewed when desktop/package-backed attachment file storage becomes active in the UI.

## Storage Model

Current browser runtime:

```text
Transaction
  → Attachment metadata
  → Inline Data URL payload
```

Target package/desktop runtime:

```text
Transaction
  → Attachment metadata in SQLite
  → Attachment file content in budget package Attachments/
```

The inline browser payload is a bridge, not the final desktop storage design.

## What This Does Not Implement

v1.55 does not add:

- Attachment preview
- Attachment open/download actions
- Thumbnail generation
- Drag/drop
- Clipboard paste
- Desktop file-store wiring
- SQLite register adapter attachment mutation

Those remain pinned for later attachment UX/runtime work.

## Files Changed

- `apps/web/src/features/accounts/accountRegisterTypes.ts`
- `apps/web/src/features/accounts/accountRegisterPersistencePort.ts`
- `apps/web/src/features/accounts/accountRegisterService.ts`
- `apps/web/src/features/accounts/useAccountRegister.ts`
- `apps/web/src/pages/AccountRegisterPage.tsx`
- `tests/v155-attachment-persistence.ts`
- `docs/v155-attachment-persistence.md`
- `package.json`

## Verification

Run:

```bash
pnpm test:v155
pnpm --filter @budget-app/web build
```

## Known Follow-up Items

Pinned for later review:

- Replace inline browser payloads with package-backed file storage where available.
- Add safe open/download behaviour.
- Add attachment preview after storage path is final.
- Decide whether desktop and browser should expose different attachment capabilities.
- Add richer UI feedback for rejected attachment files.
