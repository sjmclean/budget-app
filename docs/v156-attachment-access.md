# v1.56 Attachment Access

## Purpose

v1.55 made browser attachments persist real content as inline Data URLs. v1.56 adds the first safe access layer for those stored browser attachments.

## Scope

Implemented:

- Open stored attachments in a new browser tab.
- Download stored attachments using a sanitised file name.
- Hide Open/Download actions for metadata-only attachments.
- Validate stored attachment URLs before exposing access actions.
- Keep remove behaviour unchanged.

Not implemented:

- Image/PDF preview inside the app.
- Thumbnail generation.
- Drag/drop attachment UX.
- Clipboard paste.
- Desktop/package-backed attachment open/download path.
- SQLite-backed attachment mutation from the web register adapter.

## Access Rules

Open/Download actions are shown only when the attachment has a browser-stored `contentDataUrl` and the payload matches one of the supported formats:

- `application/pdf`
- `image/jpeg`
- `image/png`
- `image/webp`

Metadata-only attachments remain visible but display an explanatory message instead of access actions.

## Security Notes

The UI does not expose arbitrary URL values. Attachment access requires a validated base64 Data URL for one of the supported MIME types. Download file names are sanitised to remove path separators and control characters.

## Current Architecture Note

This remains browser attachment access, not the final desktop/package-backed attachment access architecture. Future work should route file access through the budget package / host runtime boundary rather than inline Data URLs.

## Verification

Run:

```bash
pnpm test:v156
pnpm --filter @budget-app/web build
```
