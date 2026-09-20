# Product roadmap

_Last reconciled: 20 September 2026_

Canonical baseline: `master` at or after `bb0f193a16cee9a49526a0b25d5119b087d6caf4` (PR #73).

This roadmap is intentionally outcome-oriented. Completed work remains listed so that already-solved areas are not accidentally reopened. Architecture work should only be revisited when new evidence shows a concrete defect or measured bottleneck.

## Current product state

The app now has a stable local-first SQLite/OPFS persistence architecture, bounded reactive reads, authoritative local command handling, background relay convergence, multi-tab ownership, warm startup, register paging/deltas, budget virtualization, and CI/browser performance evidence.

The performance programme through P0.8 is complete. The next major tranche is product UX rather than persistence re-architecture.

## Completed

### Core persistence and command architecture

- Local-first SQLite/OPFS is authoritative for ordinary interactive budget state.
- Single physical SQLite worker / ownership boundary.
- Local command serialization and atomic canonical + outbox commits.
- Ordinary reads are local; relay convergence is background/control-plane work.
- Conflict recovery is separate from ordinary mutation paths.
- P0.3 command architecture integration completed.
- P0.4 authoritative Account Register mutation deltas completed.
- P0.5 bounded shared reactive query cache completed.
- P0.6 projection benchmark/rebaseline completed; broad materialized projection redesign rejected by evidence.
- P0.7 Budget workspace virtualization completed.
- P0.8 warm startup and browser-wide multi-tab SQLite ownership completed.
- Foreground Register ownership reacquisition after browser-tab suspension fixed in PR #73.

### Performance finalisation

- Startup auth-status request sharing.
- Local budget capability/status reads kept local.
- Redundant relay health/status probes removed from normal convergence.
- Metadata publication deduped.
- Local-first convergence benchmark coverage at large mutation volumes.
- Chromium/OPFS warm-open and register performance smoke.
- Optional Account Register tools split into lazy chunks.
- Global and Account Register bundle budgets established.
- Sidebar startup account loading improved with cheap account identities and shared navigation enrichment.
- Initial workspace ordering changed to prioritise authoritative local account identities before background convergence.

Performance work is considered **closed unless browser evidence identifies a concrete regression**.

If projection performance must be revisited later, use this order:
1. bounded month-boundary account-balance checkpoints;
2. cheaper bounded transaction/split extraction;
3. pure projection-engine optimisation.

### Budget and category UX already delivered

- Organise Categories.
- Category settings/policy separation.
- Multi-source **Cover Overspending** with user-defined amounts from multiple categories.
- Cover Overspending E2E coverage.
- Budget workspace virtualization for large category sets.
- Theme passes 1–3.

### Account Register and transaction foundations already delivered

- Desktop inline transaction add/edit foundation.
- Mobile amount-first transaction-entry foundation.
- Date, payee, category and transfer pickers.
- Split transaction editor.
- Memo/check-number support.
- Save and Save & Add Another foundations.
- Register header cleanup.
- Initial Customize Register work.
- Register paging/windowing and targeted mutation reconciliation.
- Optional merchant/payee icons.
- Payee management/search/merge improvements.
- Stable register loading lifecycle.
- Tab-suspension ownership/reacquisition correctness.

### Import and migration workflows already delivered

- YNAB4 import.
- Actual Budget import.
- Import review and transaction-edit workflows.
- Import payee/category matching.
- Import tags and attachments.
- Split editing during import review.
- Find Existing Transaction / matching workflows.
- Stable import modal/menu interaction and stacking fixes.
- SQLite backup/open-as-new-budget lifecycle foundations.

Actual Budget import is therefore **not** a future roadmap item.

## Next: UX tranche

### Phase 3A — Transaction Entry UX

Immediate next phase.

Audit the current implementation first and retain the foundations that already work. The goal is refinement and consistency, not a rewrite.

Scope:
- initial focus;
- desktop field order and Tab order;
- keyboard-first entry;
- date entry;
- payee entry;
- category entry;
- account/transfer entry;
- inflow/outflow entry;
- split workflow;
- validation;
- Save;
- Save & Add Another;
- Cancel and Escape;
- consistent add/edit behaviour;
- mobile amount-first flow refinement.

Before implementation, inspect the existing `ux/phase-3a-transaction-entry` branch against current `master`. Preserve meaningful unique work if present; otherwise rebuild the branch from current master.

### Phase 3B — Broader Account Register UX

After Phase 3A:
- register interaction polish;
- selection and bulk-action consistency;
- filtering/search ergonomics;
- keyboard/navigation consistency;
- row/edit-state clarity;
- empty/loading/error states;
- selective E2E coverage for the highest-risk journeys.

### Phase 3C — Register customisation

Build on the existing Customize Register foundation:
- column/display preferences;
- density and visibility choices where useful;
- persisted user preferences;
- reset/default behaviour;
- ensure customisation does not compromise accessibility or keyboard flow.

### Phase 3D — Adaptive Register

Refine responsive behaviour across:
- large desktop;
- compact desktop;
- tablet;
- mobile.

The goal is one coherent Register model with adaptive presentation, not divergent desktop/mobile feature sets.

## Next product UX areas

### Budget Screen UX

After the Register tranche:
- review hierarchy, interaction density and clarity;
- category-group interaction polish;
- editing/focus/keyboard behaviour;
- large-budget usability on top of the completed virtualization architecture;
- mobile/adaptive behaviour;
- targeted E2E coverage.

### Scheduled Transactions UX

The persistence and execution foundations exist. Remaining work is primarily user-facing:
- creation/editing workflow polish;
- recurrence clarity;
- upcoming/overdue presentation;
- register interaction;
- bulk/review flows where justified;
- mobile/adaptive behaviour.

### Shared application UX polish

Cross-cutting work that should be handled by responsibility rather than arbitrary file-size refactors:
- dialogs;
- toasts;
- validation;
- error/recovery states;
- settings consistency;
- attachment UX;
- accessibility and keyboard behaviour;
- loading/empty states;
- responsive consistency.

## Parked / deliberately deferred

These should not interrupt the current UX tranche unless a reproducible defect makes them blocking.

- **Review Overspending** workflow.
- Goal/Target consolidation.
- Full reconciliation workflow.
- Historical matched-transfer display issue unless it becomes reproducible.

Overspending remains three distinct concepts:
1. Cover Overspending — implemented.
2. Overspending policy/category settings — implemented separately.
3. Review Overspending — parked.

## Major feature backlog

These are product features rather than persistence prerequisites.

### Data portability

- CSV export.

### Transaction discovery

- All Transactions view.
- richer saved filters/search once the All Transactions model is established.

### Reporting

- Net Worth.
- Income & Expenses.
- broader reporting suite.
- saved report/filter configurations where useful.

### Rules and automation

- saved transaction rules;
- categorisation/payee automation;
- recurring workflow automation beyond the existing scheduled-transaction foundation.

### Planning tools

- forecasting;
- savings planning;
- debt planning.

These should come after the core Register and Budget UX is mature enough that new analytical surfaces are built on stable interaction patterns.

## Later productisation

After the single-user/local-first product experience is mature:

- self-hosting workflow refinement;
- multi-user support;
- authentication/authorisation hardening;
- security review;
- backup/restore operational UX;
- deployment and upgrade workflows;
- observability/support diagnostics;
- operational documentation.

## Engineering guardrails

Future work should preserve the architecture already proved by P0.3–P0.8:

- SQLite/OPFS remains authoritative locally.
- Do not introduce a second interactive persistence authority.
- Do not introduce another physical SQLite worker for ordinary product state.
- Ordinary local writes must not wait for relay sync.
- Prefer replace → migrate → prove → delete over compatibility shims.
- Do not use retry loops, sleeps or inflated timeouts as correctness mechanisms.
- Reopen performance architecture only from measured browser evidence.
- Keep generated architecture/audit documents current when persistence boundaries change.
- Exact-head CI and focused VM/browser verification remain part of the merge gate for high-risk UX, persistence and lifecycle changes.

## Near-term sequence

1. Phase 3A — Transaction Entry UX.
2. Phase 3B — broader Account Register UX.
3. Phase 3C — Register customisation.
4. Phase 3D — adaptive Register.
5. Budget Screen UX.
6. Scheduled Transactions UX.
7. Shared dialogs/toasts/validation/errors/settings/attachments polish.
8. CSV export.
9. All Transactions.
10. Net Worth / Income & Expenses / broader reports.
11. Saved filters, rules and automation.
12. Forecasting / savings / debt planning.
13. Self-hosting and multi-user productisation/security/operations.

The order after the UX tranche can change when user value or implementation dependencies justify it; completed persistence/performance work should not be reopened merely to create activity.
