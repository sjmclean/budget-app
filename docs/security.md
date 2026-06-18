# Security and Privacy

The application is local-first, so security focuses on protecting local files, backups, attachments, imports, and future sync workflows.

## Current security foundations

- Password hashing and key derivation helpers in `packages/security`.
- Encrypted payload helpers.
- Encrypted record metadata.
- Backup integrity validation.
- Attachment path safety.
- Safe restore path validation.
- Lock-file foundations.

## Path safety

Never allow imported filenames, attachment names, or restore paths to escape the budget package. Defend against:

- `../` traversal.
- Absolute paths.
- Symlinks where applicable.
- Overwriting files outside the package.

## Attachments

Attachments are user-controlled files. The backend should store and retrieve them safely but should not execute them. Future UI should avoid automatic execution and should consider safe thumbnail generation rules.

## Backups

Backups should be validated before restore. Recommended future behaviour:

- Backup before migration.
- Backup before large imports.
- Restore dry-run.
- Optional encrypted backups.
- Compatibility/version checks.

## Encryption

The backend has foundations for encrypted records and keys. A production-grade privacy mode should eventually support:

- Full budget database encryption or encrypted sensitive fields.
- Encrypted attachments.
- Encrypted backups.
- Password change flow.
- Recovery-key warnings.
- Secure local key storage via platform APIs where possible.

## Local privacy features

Useful UI-level privacy features:

- Hide balances / privacy mode.
- Auto-lock after inactivity.
- Clear recent budgets.
- Disable previews/thumbnails.

## Sync caution

Cloud sync provider integration is future work. Sync must respect lock files, stale locks, conflict detection, fingerprints, and backup-before-merge behaviour.
