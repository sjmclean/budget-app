# Current Codebase Audit

Status: post uploaded codebase audit, v1.2.15 root / v1.3.1 web package.

## Executive Summary

The repository contains a mature backend/package layer, but the visible React web app still persists most working data through browser `localStorage` services. This creates a split between backend capability and user-visible functionality.

The next roadmap should therefore prioritise integration work before adding more localStorage-only features.

## Audit Table

| Area | Backend / package exists | Web UI exists | SQLite wired in UI | Status | Priority |
|---|---:|---:|---:|---|---|
| Budget persistence | Yes | Partial | No | Backend exists; UI still localStorage-style | Critical |
| Accounts | Yes | Yes | No | UI works, but not real DB-backed app flow | Critical |
| Register transactions | Yes | Yes | No | Strong UI, localStorage persistence | Critical |
| Transfers | Yes | Yes | No | Present, but UI/backend split remains | High |
| Splits | Yes | Yes | No | Present; verify edge cases after DB wiring | High |
| Categories | Yes | Yes | No | Management UI exists; backend also exists | High |
| Category merge | Yes | Yes | No | Duplicate localStorage/backend logic risk | High |
| Payees | Yes | Yes | No | Persistence/autocomplete/rename present in UI | High |
| Payee merge | Yes | No | No | Backend exists; UI missing | High |
| Payee archive | Yes | No | No | Backend exists; UI missing | High |
| Scheduled transactions | Yes | Yes | No | UI exists; scheduled splits missing | High |
| Scheduled splits | Partial/unclear | No | No | Still missing from visible UI | Medium |
| Attachments | Yes | Partial | No | UI metadata only; open/download/storage unresolved | High |
| Reconciliation | Yes | No | No | Backend/tests exist; UI missing | High |
| Budget activity drilldown | Partial | No | No | Activity totals exist; drilldown missing | High |
| Overspending workflow | Yes | Partial | No | Backend exists; UI not fully wired | High |
| Cover overspending | Yes | No | No | Backend exists; UI missing | High |
| Reports | Yes | Stub/partial | No | Backend report calculations exist; UI weak | Medium |
| Export / backup | Yes | No | No | Backend package exists; UI missing | High |
| Restore | Yes | No | No | Backend exists; UI missing | High |
| CSV import | Yes | No | No | Backend preview/commit exists; UI missing | High |
| QIF import | Yes | No | No | Backend exists; UI missing | High |
| OFX/QFX import | Yes | No | No | Backend exists; UI missing | High |
| YNAB4 import | Yes | No | No | Backend importer exists; UI missing | High |
| Payee rules | Yes | No | No | Backend exists; UI missing | Medium |
| Auto-categorisation | Yes | No | No | Backend exists; UI missing | Medium |
| Search/filtering | Yes | Partial/unclear | No | Backend search exists; UI limited | Medium |
| Undo/redo | Yes | No | No | Backend exists; UI missing | Medium |
| Security/path safety | Yes | N/A | N/A | Good backend foundations | Medium |
| Encryption | Yes | No | No | Backend exists; not surfaced in app | Medium |
| Foreign key integrity | Planned/partial | N/A | N/A | `PRAGMA foreign_keys = ON` exists, but schema lacks real FK constraints | High |
| Custom in-app messages | No | No | N/A | `alert()` / `confirm()` still used | Medium |
| Screen clutter review | N/A | Needed | N/A | User concern remains valid | Medium |
| Tauri desktop | Partial/unclear | No | No | Stack intended; not confirmed wired | High |
| iPad/PWA path | Partial | Partial | No | Web app exists, but persistence model unresolved | Medium |

## Important Source Findings

### LocalStorage persistence still drives the web app

The following web services directly use `window.localStorage`:

- `apps/web/src/features/accounts/accountService.ts`
- `apps/web/src/features/accounts/accountRegisterService.ts`
- `apps/web/src/features/accounts/payeeService.ts`
- `apps/web/src/features/accounts/scheduledTransactionService.ts`
- `apps/web/src/features/budget/budgetViewService.ts`
- `apps/web/src/stores/uiStore.ts` for UI theme only; this one is acceptable.

### Browser dialogs still exist

The following UI files still use generic browser dialogs:

- `apps/web/src/components/accounts/ScheduledTransactionsPanel.tsx`
- `apps/web/src/layouts/Sidebar.tsx`
- `apps/web/src/pages/AccountRegisterPage.tsx`
- `apps/web/src/pages/BudgetPage.tsx`

These should be replaced with app-specific dialogs/toasts.

### Backend features are ahead of UI wiring

Backend/package services exist for many roadmap features, including:

- Payee merge/archive
- Category merge
- Reconciliation
- Overspending decisions
- Backup/restore
- Import preview/commit/rollback
- YNAB4 import
- Security/path safety
- Search/indexing
- Undo/redo

The issue is not only feature absence; it is that much of this capability is not exposed through the current web UI.

## Recommended Roadmap

| Order | Release | Goal |
|---:|---|---|
| 1 | v1.19a | Create/confirm web persistence adapter seam and document current split |
| 2 | v1.19b | Wire budget selector/accounts/register to DB-backed storage path |
| 3 | v1.19c | Wire categories/payees/scheduled transactions to DB-backed storage path |
| 4 | v1.19d | Add Payee Merge UI using existing backend service semantics |
| 5 | v1.19e | Add Payee Archive / Show Archived / Restore UI |
| 6 | v1.20 | Replace `alert()` / `confirm()` with in-app dialog/toast system |
| 7 | v1.21 | Add explicit overspending workflow UI |
| 8 | v1.22 | Add budget activity drilldown |
| 9 | v1.23 | Add reconciliation UI |
| 10 | v1.24 | Add backup/export/restore UI |
| 11 | v1.25 | Add import UI: CSV/QIF/OFX/QFX |
| 12 | v1.26 | Add YNAB4 import UI |

## Recommendation

Do not add more localStorage-only feature work unless it is deliberately short-lived prototype work.

The safest next implementation step is to introduce a narrow persistence seam in the web app, then replace each localStorage service with a DB-backed adapter one feature area at a time.
