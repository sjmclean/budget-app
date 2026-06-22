# v1.51 Budget Lifecycle

## Purpose

v1.51 adds destructive budget lifecycle actions now that the required safety foundations exist:

- v1.46 Budget Registry Foundation
- v1.47 Active Budget Context
- v1.48 Budget Isolation Completion
- v1.49-v1.50.1 Budget Backup / Restore

The release implements Reset Budget and Delete Budget only. Clone Budget is intentionally deferred because its UI/UX and utility are not yet clear enough to justify adding it.

---

## Reset Budget

Reset Budget targets the currently selected budget only.

It preserves:

```text
Budget registry entry
Budget id
Budget name
Currency
Global app preferences
Other budgets
```

It removes:

```text
Accounts
Account registers
Transactions
Payees
Scheduled transactions
Attachment metadata stored on transactions
Budget month views
Custom category structure
Assigned amounts
Activity-derived budget records
```

After removing scoped records, v1.51 recreates a starter budget month for the current month using the default category template. Ready to Assign is reset to zero.

---

## Delete Budget

Delete Budget targets the currently selected budget only.

It removes:

```text
Budget registry entry
Budget-scoped browser storage records
Legacy household bridge records, when deleting the original household budget
Selected budget id
```

It preserves:

```text
Other budgets
Other budget-scoped data
Global app preferences
Diagnostic settings
```

Deleting the final budget is allowed. The budget selector then shows the empty first-run state and the user can create a new budget.

---

## Safety Behaviour

Both Reset and Delete require confirmation and remind the user to create a backup first.

The lifecycle implementation does not create backups automatically. This keeps the operation explicit and avoids silently producing files the browser may block or the user may not notice.

---

## Deferred: Clone Budget

Clone Budget remains pinned but out of scope.

Reasons:

```text
No settled UI/UX placement
Unclear practical utility at this stage
Potential overlap with backup/restore
Risk of adding lifecycle complexity before real usage clarifies the workflow
```

Future review should decide whether Clone means:

```text
Structure only
Structure plus accounts
Full duplicate
Template creation
```

---

## Validation

```bash
pnpm test:v151
pnpm test:release-integrity
pnpm --filter @budget-app/web build
```
