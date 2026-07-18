# v3.21.8 Overlapping QIF behavioural regression

This milestone adds permanent QIF fixtures for the importer overlap case documented during the integrity programme.

- `Transactions (31).qif` contains 41 baseline transactions.
- `Transactions (32).qif` contains the same 41 transactions plus 5 new transactions.
- The fixtures include two identical repeated purchases to verify occurrence-aware, one-for-one matching.

The behavioural regression executes the production QIF parser and transaction preview matcher. It verifies that importing the second file against a register populated from the first file produces exactly 41 exact matches and 5 new transactions, without collapsing repeated identical purchases.

Run with:

```bash
pnpm test:v3218
pnpm --filter @budget-app/web build
```
