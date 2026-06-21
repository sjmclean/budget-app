# v1.19b Persistence Migration Matrix

Status: planning checkpoint after v1.19a persistence audit.

## Key Decision

Do **not** import the SQLite repositories directly into the Vite web app.

The existing repository/application layer depends on `better-sqlite3`, which is a native Node/Tauri-side dependency. The browser web bundle cannot safely or correctly use it directly.

Therefore the migration requires an adapter seam:

```text
React UI
  -> Feature service / hook
  -> Budget data gateway interface
  -> Browser-local implementation for current web prototype
  -> Tauri/database implementation for desktop SQLite
  -> SQLite repositories/application services
```

This avoids breaking the current web app while making the storage boundary explicit.

## Service Migration Matrix

| Current UI service | Current storage | Target backend/repository path | Difficulty | Status | Notes |
|---|---|---|---|---|---|
| `accountService` | `window.localStorage`: `budget-app-accounts-v1`, plus register cleanup keys | `AccountRepository` / `SqliteAccountRepository` through `AccountManagementApplicationService` | Medium | Needs adapter | Good first feature after a gateway exists. Deleting accounts must define safety/cascade behaviour. |
| `accountRegisterService` | `window.localStorage`: `budget-app-registers-v1` | `TransactionRepository`, `SplitTransactionLineRepository`, attachment/metadata repositories | High | Needs adapter | Highest blast radius. Transfers, splits, flags, memos, payeeId/categoryId compatibility, attachments, and balances depend on this. |
| `budgetViewService` | Per-budget/month `localStorage` state plus direct register/scheduled reads | `BudgetMonthRepository`, `CategoryMonthRepository`, `TransactionRepository`, `ScheduledTransactionRepository`, budget engine/application services | High | Needs adapter | Do not migrate first. Activity and available amounts depend on register/category mapping. |
| `payeeService` | `window.localStorage`: `budget-app-payees-v1` | `PayeeRepository` plus `PayeeManagementApplicationService` | Medium | Needs adapter | Backend merge/archive exists, but UI is still independent. Rename/merge must update register and scheduled references through one path. |
| `scheduledTransactionService` | `window.localStorage`: `budget-app-scheduled-transactions-v1` | `ScheduledTransactionRepository` plus management/execution services | Medium | Needs adapter | Migrate after account/category/payee IDs are authoritative. Scheduled splits remain missing UI capability. |
| `uiStore` | `window.localStorage`: theme only | Optional later `UserSettingsRepository` | Low | Leave as-is | Browser-local UI preference storage is acceptable and should not block budget data migration. |
| SQLite repository layer | Native package code | Tauri command bridge or equivalent backend adapter | Blocked | Needs bridge | The web bundle cannot directly use `better-sqlite3`. |

## Recommended v1.19 Implementation Order

### v1.19c — Introduce budget data gateway seam

Create browser-safe interfaces for the data operations the UI needs, without changing behaviour yet.

Suggested path:

```text
apps/web/src/features/persistence/BudgetDataGateway.ts
apps/web/src/features/persistence/browserLocalBudgetDataGateway.ts
apps/web/src/features/persistence/getBudgetDataGateway.ts
```

Rules:

- Keep the current localStorage implementation as the default.
- Do not import `better-sqlite3` or SQLite repositories into `apps/web`.
- Add a clear TODO boundary for a future Tauri-backed gateway.
- No UI redesign.
- No feature changes.

### v1.19d — Move account service behind gateway

Migrate only account operations behind the gateway interface.

Why first:

- Smaller than register/budget view.
- Establishes budget-data gateway pattern.
- Helps future account deletion safety work.

### v1.19e — Move payee service behind gateway

Migrate payees next, then use the backend semantics for merge/archive UI work.

Why before register:

- Payee IDs already exist in UI models.
- Payee merge/archive is the next desired feature area.
- It reduces the chance of building more localStorage-only payee features.

### v1.19f — Move scheduled transactions behind gateway

Do this after payee/category/account identity is stable.

### v1.19g+ — Register and budget view migration

These should be split carefully:

1. Transaction persistence
2. Split persistence
3. Transfer handling
4. Attachment metadata handling
5. Running balance derivation
6. Budget activity derivation
7. Overspending workflow integration

## Do Not Do Yet

Avoid these until the gateway seam exists:

- Payee merge UI that only updates localStorage
- Archive payee UI that only updates localStorage
- Further category merge logic in the UI service
- Import UI that writes to localStorage
- Reconciliation UI that is disconnected from real transaction persistence

## Acceptance Criteria For v1.19b

- The migration matrix is documented.
- A browser-safe source metadata file exists for surfacing/planning the migration.
- The build still passes with:

```bash
pnpm --filter @budget-app/web build
```

No runtime persistence behaviour should change in v1.19b.
