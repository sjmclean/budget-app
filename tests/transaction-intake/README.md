# Transaction Intake tests

These tests are the stable subsystem suite for Transaction Intake.  They sit
alongside the historical `v####` regression tests so older release scripts keep
working while new work can run focused subsystem checks.

Run the full Transaction Intake suite with:

```bash
pnpm test:transaction-intake
```

Or run individual areas:

```bash
pnpm test:transaction-intake:matching
pnpm test:transaction-intake:review
```
