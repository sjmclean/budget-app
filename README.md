# Payee merge learning overlay

This overlay fixes multi-source SQLite merge rollback, replaces the Possible Duplicates merge wizard with one confirmation dialog, makes merge invariants mandatory, exposes mutation errors, and preserves exact retired payee names as recognition aliases.

Apply from the repository root:

```bash
tar -xzf payee-merge-learning-overlay.tar.gz
cp -a payee-merge-learning-overlay/. ./
```

Verify:

```bash
pnpm test:milestone4:payee-merge-learning
pnpm verify:milestone4:payee-possible-duplicates
pnpm verify:milestone4:payee-management-redesign
pnpm test:v1214:payee-rules
pnpm test:web-build
```

Run:

```bash
pnpm dev
```
