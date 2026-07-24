# Attachment content-store foundation

This change separates transaction attachment metadata from attachment bytes in the web runtime.

## Behaviour

- Register metadata stores the attachment ID, filename, MIME type, size, SHA-256 hash and a content reference.
- New browser attachments are stored as `Blob` records in IndexedDB rather than as base64 data URLs in register persistence.
- Existing inline data URL attachments remain readable for backwards compatibility.
- Removing attachment metadata also attempts to remove the local blob.
- A metadata record whose content is absent on the current device remains visible and reports that the content is not available locally.

## Boundary

`AttachmentContentStore` provides `put`, `read`, `delete` and `exists` operations. The browser implementation uses IndexedDB. A memory implementation supports tests and non-browser runtimes until the desktop/package implementation is wired.

Future implementations can provide:

- OPFS-backed browser files;
- package-folder storage for desktop;
- remote content-addressed blob download/upload;
- encryption before remote upload.

The content reference is intentionally metadata-only. Binary bytes are not placed in the register key-value snapshot or future operation journal.
