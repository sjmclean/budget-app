# v1.42 Payee Merge

## Purpose

Add an explicit payee merge workflow now that v1.41 introduced archive-first payee lifecycle semantics.

## Behaviour

A merge takes a source payee and a target payee:

```text
Source Payee
  ↓
Reassign existing references
  ↓
Target Payee
  ↓
Archive Source Payee
```

## Rules

- The source payee is archived, not physically deleted.
- The target payee remains active.
- Register transaction references move from source payee id/name to target payee id/name.
- Scheduled transaction references move from source payee id/name to target payee id/name.
- Historical transaction visibility is preserved.
- Archived payees cannot be merged until restored.
- Target options are limited to active payees.

## Runtime Notes

The browser localStorage implementation performs payee lifecycle and reference reassignment through the existing web persistence ports.

The SQLite payee adapter now accepts an optional transaction payee updater seam so a host runtime can compose payee merge with transaction foreign-key reassignment.

## Validation

```bash
pnpm test:v142
pnpm test:release-integrity
pnpm --filter @budget-app/web build
```
