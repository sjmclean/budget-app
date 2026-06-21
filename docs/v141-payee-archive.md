# v1.41 Payee Archive

## Purpose

Adds reversible payee archiving to the web app persistence boundary and Manage Payees workflow.

Archived payees are hidden from daily entry surfaces but remain stored so historical transaction references are preserved.

## Behaviour

- Active payees continue to appear in payee autocomplete and payee lists.
- Archived payees are hidden from active lists and autocomplete resolution.
- Archived payees remain available in Manage Payees under an Archived section.
- Archived payees can be restored.
- The legacy `deletePayee` web persistence operation now archives instead of hard-deleting.
- Recording a transaction with the same name as an archived payee restores that payee rather than creating a duplicate.

## Persistence

The web payee persistence port now includes:

```ts
archivePayee(payeeId: string): Promise<PayeeView[]>;
restorePayee(payeeId: string): Promise<PayeeView[]>;
listArchivedPayees(): Promise<PayeeView[]>;
```

Browser localStorage now persists `PayeeView.isArchived`.

The SQLite adapter maps these operations to the existing SQLite payee archive support and `is_archived` storage.

## Validation

Run:

```bash
pnpm test:v141
pnpm test:release-integrity
pnpm --filter @budget-app/web build
```

`tests/v141-payee-archive.ts` validates the browser and SQLite adapter archive lifecycle and confirms the Manage Payees UI is wired to archive/restore actions.
