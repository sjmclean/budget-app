# Payee duplicate correctness overlay

This overlay replaces transitive connected-component grouping with
anchor-centred duplicate groups. Every displayed candidate has direct,
pair-scoped evidence against its anchor.

It also adds whole-token phrase evidence, generic-name protection,
payment-processor prefix handling, pair-scoped suppression, per-candidate
evidence in the existing review UI, and direct-evidence post-merge rule
selection.

## Apply on Linux

From the Budget App repository root:

```bash
cp -a payee-duplicate-correctness-overlay/. ./
```

## Verify

```bash
pnpm test:milestone4:payee-possible-duplicates
pnpm test:v142:payee-merge
pnpm test:v1214:payee-rules
pnpm exec tsx tests/v3160-import-commit-extraction.ts
pnpm test:v152:transaction-import
pnpm test:v3221:import-facade-regression
pnpm test:web-build
```

Run normally with:

```bash
pnpm dev
```
