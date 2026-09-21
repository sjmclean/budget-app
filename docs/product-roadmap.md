# Product Roadmap

# Budget App Development Service — Quick Reference

The development stack is now managed by the `budget-app-dev` systemd user service. An open PuTTY/SSH session is no longer required for the app to remain accessible. User lingering is enabled for `sjmclean`, allowing the service manager to continue without an active login and to start enabled user services after boot.

Common commands:

```bash
systemctl --user status budget-app-dev
systemctl --user restart budget-app-dev
systemctl --user stop budget-app-dev
systemctl --user start budget-app-dev
journalctl --user -u budget-app-dev -f
```

Useful checks:

```bash
loginctl show-user sjmclean -p Linger
ss -ltnp | grep -E ':3000|:5173'
```

Current development endpoints:

- frontend/Vite: port `5173`;
- backend/server: port `3000`.

This is an operational improvement to the existing development stack, not yet a production deployment model. Docker/container packaging, reverse proxying, production builds, deployment automation, upgrade procedures and broader operational hardening remain future work.

---

*Last reconciled: 21 September 2026*

Code baseline before roadmap-only documentation updates: `master` at `d917d709582f52e8cbf53a32211b36d68c4491af` (PR #83).

Guiding sequence:

**Correct → Reliable → Fast → Polished → Smart**

The major persistence and performance programme is substantially complete. The next stage is product UX, but before beginning the next large UX tranche we should perform a bounded close-out review of the areas changed most heavily during the final performance/import work.

## Current product state

The app now has a mature local-first SQLite/OPFS architecture with:

- SQLite/OPFS as the authoritative interactive budget state.
- One intended physical SQLite worker.
- Local command serialization.
- Atomic canonical + outbox writes.
- Local ordinary reads.
- Background relay/control-plane convergence.
- Multi-tab database ownership.
- Browser suspension/reacquisition handling.
- Bounded reactive query caching.
- Account Register paging and mutation deltas.
- Budget workspace virtualization.
- Warm navigation paths.
- CI/browser performance evidence.
- Import workflows covering YNAB4, Actual Budget and bank transaction imports.

Persistence architecture should no longer be reopened without concrete correctness evidence or measured browser evidence.

---

# Completed Architecture and Performance Programme

## Local-first persistence and command architecture

Completed:

- P0.3 command architecture.
- P0.4 authoritative Account Register mutation deltas.
- P0.5 bounded shared reactive query layer.
- P0.6 projection benchmarking and rebaseline.
- P0.7 Budget workspace virtualization.
- P0.8 startup and multi-tab SQLite ownership.
- Local Budget Engine command boundary.
- Atomic SQLite canonical + outbox commit model.
- Conflict recovery separated from ordinary mutation.
- Single-worker ownership model.
- Browser suspension physical-database release.
- Foreground ownership reacquisition.

## Performance finalisation

Completed:

- shared startup authentication status;
- removal of redundant status/health traffic;
- local ordinary budget status handling;
- metadata publication deduplication;
- large local-first convergence benchmarks;
- Chromium/OPFS performance evidence;
- Account Register lazy loading/chunk splitting;
- global and route bundle budgets;
- cheap sidebar account-identity startup;
- shared account navigation enrichment;
- critical-local-read-before-background-convergence ordering.

## Navigation and Register paint improvements

Completed:

### PR #77 — Register bootstrap reuse

- sidebar hover/focus Register prefetch;
- in-flight read coalescing;
- single-use warm Register bootstrap;
- bounded retention;
- revision validation.

### PR #78 — Register snapshot retention

- authoritative Register refresh re-seeds navigation snapshot;
- Budget → Account navigation no longer falls back to a loading flash;
- StrictMode replay protected from consuming the warm snapshot twice.

### PR #79 — Scheduled transaction preview warming

- scheduled preview warmed independently of critical Register bootstrap;
- bounded preview cache;
- scoped revision validation;
- synchronous first paint where warm data is valid;
- normal authoritative refresh remains after mount.

The rejected approach of adding scheduled transactions to the critical Register bootstrap should remain rejected unless new evidence justifies reconsideration.

## Browser suspension / tab lifecycle

Completed:

### PR #73

Established:

- active budget intent separate from physical SQLite ownership;
- suspension releases physical ownership;
- foreground reacquisition;
- same-budget activation coalescing;
- removal of obsolete Register capability probing.

### PR #82

Closed the remaining foreground race:

- ordinary owned operations now wait for configured persistence readiness when physical ownership has been released;
- hidden/background tabs remain fail-closed;
- foreground calls reacquire through the existing lifecycle;
- one worker and one Web Lock remain authoritative;
- no retries, sleeps or second persistence path were introduced.

---

# Completed Import Improvements

The import system already includes substantial functionality and should be treated as an existing product subsystem rather than a future feature.

Completed foundations include:

- YNAB4 import.
- Actual Budget import.
- CSV/QIF/OFX-style bank import infrastructure.
- import review workflow;
- matching against existing transactions;
- import source identity/fingerprints;
- payee/category inference;
- manual matching;
- split editing;
- tags;
- attachments;
- transfer handling;
- staged/session persistence;
- historical matching/provenance infrastructure.

## PR #80 — Import review clarity and edit preservation

Completed:

- `Bank transaction` clarified to `Bank statement`;
- proposed canonical result shown as `Will import as: …`;
- manually reviewed payee becomes authoritative;
- manual payee edits are no longer fed back through merchant inference;
- explicit transfer syntax remains supported;
- matched and newly imported transactions share the same recent-import visual treatment.

## PR #83 — Recent import presentation lifetime

Completed:

- Imported / Matched badges remain session-scoped.
- Row tint is temporary.
- Tint expires after 15 minutes.
- Leaving the destination Account Register permanently consumes the tint for that import.
- Returning to the account retains badges without stale row tint.
- A new import replaces the previous recent-import activity for that account.

---

# Immediate Close-Out Review

Before starting the next major UX phase, perform two bounded review tracks.

These are reviews of the finished systems, **not permission to redesign them without evidence**.

## Review A — Import Workflow

Perform an end-to-end importer UX and correctness review.

### File ingestion and detection

Review:

- CSV;
- QIF;
- OFX/QFX where applicable;
- source/date/amount format detection;
- invalid-file/error presentation;
- duplicate-file and already-imported behaviour.
### Review screen

Verify:

- raw bank source is clearly distinguishable from proposed canonical transaction;
- payee proposal;
- category proposal;
- transfers;
- splits;
- memo handling;
- tags;
- attachments;
- cleared state where relevant;
- new vs matched transactions;
- manual Find Existing Transaction workflow;
- ownership of manually matched transactions;
- resetting/changing a match;
- import-as-new after a suggested match.

### Manual edits

Confirm manual review decisions remain authoritative:

- edited payee;
- edited category;
- edited memo;
- edited splits;
- transfer account;
- manually created payees/categories;
- matched-register edits.

Automatic merchant/payee inference must not silently override a reviewed value.

### Commit and post-import experience

Verify:

- atomic import commit;
- imported transaction IDs are stable;
- matched transaction updates are correct;
- provenance/fingerprint data is preserved;
- undo/history behaviour remains correct;
- Imported / Matched badges apply to the correct rows;
- row tint disappears after navigation away;
- row tint expires after 15 minutes;
- badges remain for the browser session;
- a later import replaces the prior recent-import marker set.

### Re-import behaviour

Verify:

- exact re-import;
- overlapping import;
- repeated source rows;
- strong source IDs;
- fallback source identity;
- settlement-date tolerance where applicable;
- manually edited historical transactions;
- previously matched transactions.

### Remaining manual acceptance item

Retest QIF import with a genuinely new/unseen QIF file or isolated test budget, because the previously used QIF was already represented by import history.

### Exit criteria

Importer review is complete when:

- no reviewed user value is unexpectedly rewritten;
- no duplicate transaction is created in covered identity cases;
- matched/new presentation is clear;
- recent-import presentation expires correctly;
- focused tests exist for any defect found.

Do not redesign the importer merely for code cleanliness.

---

## Review B — Performance, Navigation and Tab Lifecycle

Perform a focused browser/VM regression review of the final performance programme.

### Startup

Check:

- initial shell appearance;
- sidebar account identities;
- account financial enrichment;
- Budget first paint;
- background sync does not block critical local UI.

### Navigation

Exercise repeatedly:

- Budget → Account;
- Account → Budget → Account;
- Account → Account;
- rapid account switching;
- account hover/focus prefetch;
- scheduled preview appearance.

Look for:

- loading flashes;
- layout shifts;
- stale account data;
- duplicate reads;
- visible pauses.

### Register

Review:

- warm bootstrap;
- authoritative refresh;
- pagination;
- load more;
- running balances;
- mutation deltas;
- scheduled preview;
- large registers;
- search/filter/sort interactions.

### Background / foreground lifecycle

Exercise:

- leave the Budget App browser tab;
- return after suspension;
- interact immediately;
- Budget → Register immediately after resume;
- Register → Budget immediately after resume;
- repeated hide/show cycles;
- two Budget App tabs where practical.

There should be no recurrence of:

`The active budget database has been released. Open a budget before using it.`

### Architectural invariants

Confirm through review/tests:

- one physical SQLite worker;
- one ownership boundary;
- no second interactive state authority;
- hidden tabs do not reopen SQLite just because a React query fires;
- foreground reads wait on lifecycle readiness;
- command serialization remains intact;
- prefetch stays opportunistic rather than becoming a correctness mechanism;
- bounded warm caches remain bounded.

### Performance evidence

Only reopen performance architecture if measurements show an actual regression.

If future projection performance becomes materially problematic, preferred investigation order remains:

1. bounded month-boundary account-balance checkpoints;
2. cheaper bounded transaction/split extraction;
3. pure projection-engine optimisation.

Do not introduce a second financial cache or projection authority.

---

# Next Major UX Tranche

After the two close-out reviews above:

## Phase 3A — Transaction Entry UX

Audit the existing transaction-entry implementation before changing it.

Refine:

- initial focus;
- desktop field order;
- Tab order;
- keyboard-first entry;
- date entry;
- payee entry;
- category entry;
- transfer/account entry;
- inflow/outflow entry;
- split workflow;
- validation;
- Save;
- Save & Add Another;
- Cancel / Escape;
- consistency between add and edit;
- mobile amount-first workflow.

If an old `ux/phase-3a-transaction-entry` branch exists, inspect it against current `master`. Preserve only meaningful current work; do not merge stale architecture accidentally.

---

## Phase 3B — Broader Account Register UX

Then review:

- interaction polish;
- row focus/edit clarity;
- selection;
- bulk actions;
- search/filter ergonomics;
- keyboard navigation;
- pagination/load-more experience;
- empty/loading/error states;
- high-value E2E coverage.

---

## Phase 3C — Register Customisation

Build on the existing customisation foundations:
- column visibility;
- density/display choices;
- persisted preferences;
- reset/default behaviour;
- accessibility;
- keyboard compatibility.

---

## Phase 3D — Adaptive Register

Refine one coherent Register model across:

- large desktop;
- compact desktop;
- tablet;
- mobile.

Avoid separate feature sets for desktop and mobile unless genuinely necessary.

---

# Subsequent Product UX

## Budget Screen UX

Review:

- visual hierarchy;
- editing behaviour;
- keyboard/focus flow;
- category groups;
- large-budget usability;
- adaptive/mobile layout;
- selective E2E coverage.

Keep existing Budget virtualization.

## Scheduled Transactions UX

Refine:

- create/edit flow;
- recurrence language;
- due/overdue clarity;
- preview/entry relationship;
- Enter/Skip workflows;
- mobile/adaptive presentation.

## Shared Application Polish

Cross-cutting:

- dialogs;
- toasts;
- validation;
- errors and recovery;
- loading/empty states;
- settings consistency;
- attachment UX;
- keyboard/accessibility;
- responsive consistency.

---

# Parked / Deferred

Keep parked unless evidence makes one blocking:

- Review Overspending.
- Goal/Target consolidation.
- Full reconciliation workflow.
- Historical matched-transfer display issue if it becomes reproducible.

Overspending remains three separate concepts:

1. Cover Overspending — implemented.
2. Overspending policy/category settings — implemented.
3. Review Overspending — parked.

---

# Major Feature Backlog

## Data portability

- CSV export.

## Transaction discovery

- All Transactions.
- richer saved search/filter workflows after the All Transactions model exists.

## Reporting

- Net Worth.
- Income & Expenses.
- broader reports.
- saved report configurations.

## Rules and Automation

- saved transaction rules;
- payee/category automation;
- workflow automation beyond Scheduled Transactions.

## Planning

- forecasting;
- savings planning;
- debt planning.

---

# Self-Hosting, Deployment and Later Productisation

## Initial development-service operability — COMPLETE

Completed on 21 September 2026:

- the existing `pnpm dev` stack is managed by a systemd user service;
- frontend and backend no longer depend on an open PuTTY/SSH session;
- the service can be started, stopped, restarted and inspected through `systemctl --user`;
- stdout/stderr is available through the systemd journal;
- `Restart=on-failure` provides basic process recovery;
- `KillMode=control-group` keeps the Vite/backend child-process lifecycle under the same service;
- lingering is enabled for `sjmclean`, so the user service manager can remain active without an SSH login and enabled services can start independently of an interactive session.

This deliberately preserves the current development-mode architecture and does not attempt to solve production deployment yet.

## Remaining self-hosting / deployment work — OUTSTANDING

Progress this incrementally rather than as one large deployment rewrite. Remaining areas include:

- production/self-hosted frontend serving rather than relying indefinitely on the Vite development server;
- production server process configuration;
- environment/configuration management;
- stable hostnames/ports and, where useful, reverse proxying;
- health/readiness integration with service management;
- deployment/redeployment workflow;
- upgrade procedure;
- persistent/rotated operational logging where journal defaults are insufficient;
- backup/restore operational UX;
- diagnostics and observability;
- operational documentation;
- optional Docker/container packaging only if it provides concrete deployment value.

After core single-user UX matures, later productisation also includes:

- multi-user support;
- authentication/authorisation hardening;
- security review.

AI remains a much later consideration and should not precede stable core workflows and automation foundations.

---

# Engineering Guardrails

Preserve:

- SQLite/OPFS is authoritative locally.
- Exactly one intended physical SQLite worker.
- Server remains relay/control plane.
- Ordinary reads stay local.
- Ordinary writes stay local-first.
- Normal writes flow through the Local Budget Engine / command executor.
- Canonical state + outbox commit atomically.
- Conflict recovery remains separate.
- No speculative financial cache as a second authority.
- No retry loops, sleeps or timeout inflation as correctness mechanisms.
- Prefer replace → migrate → prove → delete.
- Warm caches must remain bounded and revision-valid.
- Register remains the specialised owner of ordered deltas, pagination and running balances.
- Generated architecture/audit outputs stay current.
- Exact-head CI + VM/browser acceptance remains the merge gate for high-risk work.

---

# Updated Near-Term Sequence

1. **Importer close-out review.**
2. **Performance/navigation/tab-lifecycle close-out review.**
3. Fix only concrete defects found by those reviews.
4. Phase 3A — Transaction Entry UX.
5. Phase 3B — broader Account Register UX.
6. Phase 3C — Register customisation.
7. Phase 3D — adaptive Register.
8. Budget Screen UX.
9. Scheduled Transactions UX.
10. Shared application UX polish.
11. CSV export.
12. All Transactions.
13. Net Worth / Income & Expenses / reporting.
14. Saved filters, rules and automation.
15. Forecasting / savings / debt planning.
16. Production self-hosting / deployment refinement, multi-user, security and operations.

The order after the main UX tranche can move according to user value and dependencies. Completed persistence/performance architecture should not be reopened simply to create more engineering work.

---

# Reconciled Legacy Roadmap Status

*Reconciled against the earlier Phase 1–10 roadmap on 21 September 2026.*

This section preserves the intent of the earlier roadmap while mapping it onto the current product state. Where later work has superseded an older “outstanding” item, the later state is authoritative.

## Phase 1 — Correctness / data integrity — COMPLETE BASELINE

The earlier roadmap already regarded Phase 1 as largely complete. That remains correct. The subsequent local-first persistence and command programme strengthened this baseline substantially: Local Budget Engine command boundaries, atomic canonical + outbox commits, serialized local commands, conflict recovery separation, one intended SQLite worker, suspension-safe ownership and foreground reacquisition are now established.

**Status:** Complete as a standing P0 baseline. New integrity defects remain priority work, but no broad Phase 1 project is planned.

## Phase 2 — Imports — SUBSTANTIALLY COMPLETE; CLOSE-OUT REVIEW ACTIVE

The older roadmap correctly regarded the foundational import programme as substantially complete, but later work expanded it further. YNAB4, Actual Budget and bank transaction import infrastructure are now implemented, together with matching, provenance/fingerprints, payee/category inference, manual matching, split editing, tags, attachments, transfers and staged/session persistence.

PR #80 improved review clarity and preserved reviewed payee edits. PR #83 established the intended recent-import badge/tint lifetime.

