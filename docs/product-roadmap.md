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

*Last reconciled: 21 September 2026 — codebase health, Node 24, full adaptive/mobile audit and competitor-informed feature candidates added*

Code baseline before roadmap-only documentation updates: `master` at `d917d709582f52e8cbf53a32211b36d68c4491af` (PR #83).

Guiding sequence:

**Correct → Reliable → Fast → Polished → Smart**

The major persistence and performance programme is substantially complete. Before beginning the next large UX tranche, the repository will go through a bounded **Codebase Health and Scalability Close-Out**. This combines static/code health review, runtime/toolchain currency, full-application adaptive/mobile scalability review, and the existing importer/performance close-out reviews. The purpose is to remove proven residue and defects, reconcile the roadmap with what is already implemented, and establish a clean baseline before substantial new UX work.

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

# Immediate Codebase Health and Scalability Close-Out

Complete this bounded programme before the importer/performance close-out reviews and before Phase 3A implementation.

The aim is **not** a speculative rewrite. Findings should be classified as:

- proven defect;
- obsolete/dead/backward-compatibility code;
- stale or misleading documentation;
- missing/inadequate test coverage;
- bounded refactor opportunity;
- roadmap/status mismatch;
- future feature candidate;
- intentional architecture that should be left alone.

## Track 1 — Dead, Obsolete and Backward-Compatibility Code

Audit for:

- unused modules, exports, helpers and dependencies;
- compatibility aliases whose callers can now use the canonical API directly;
- retired persistence/provider vocabulary;
- old route/API tombstones that no supported client still needs;
- old migration paths that can be retired safely;
- historical configuration switches no longer consumed by the runtime;
- duplicated helpers and redundant abstraction layers;
- stale tests that only protect removed architecture.

Known candidates to verify include:

- the backwards-compatible `isCanonicalBudgetStorageKey` alias;
- old persistence-source/provider terminology;
- retired hosted budget-domain API tombstones;
- one-way legacy browser-storage migration code and its retirement criteria.

Do not delete migration or compatibility code merely because it looks old. Removal requires proof that no supported stored data, runtime path or client still depends on it.

## Track 2 — Documentation and Architecture Vocabulary

Review:

- root README;
- documentation index;
- canonical architecture documents;
- architecture index classification;
- generated persistence audit;
- product roadmap;
- operations/recovery documentation;
- current self-hosted development-service instructions.

Required cleanup includes:

- add the product roadmap to the documentation index;
- ensure every architecture document is clearly current, generated, historical or decision record;
- remove stale IndexedDB-as-financial-authority wording;
- correct the persistence audit generator's local-storage classification mismatch;
- ensure generated audit output describes SQLite/OPFS authority accurately;
- reconcile terminology such as local database, document replication, hosted/local-first and provider names with current responsibilities.

## Track 3 — Tests and Verification Quality

Audit:

- whether tests protect current product behaviour rather than superseded architecture;
- unit/integration/regression overlap;
- browser/E2E gaps;
- flaky setup/teardown;
- fixed sleeps/timeouts used as correctness mechanisms;
- direct engine calls in browser tests where a user-level workflow should also be covered;
- reusable E2E fixtures for authentication/budget/account setup;
- exact-head CI gates and failure diagnostics.

Immediate test-quality candidate:

- replace the Cover Overspending E2E fixed `waitForTimeout(750)` with an observable persisted/committed condition.

Browser coverage should eventually include real user workflows for:

- transaction creation/editing;
- transfers;
- splits;
- imports;
- Register customisation;
- Budget interactions;
- Settings/recovery;
- reports;
- permissions/user management;
- suspension/resume and multi-tab lifecycle.

## Track 4 — Bounded Refactor and Maintainability Review

Inspect large/high-pressure modules and extract only where it improves the next product work.

Current pressure points include:

- `AccountRegisterPage.tsx`;
- `RegisterTransactionEditor.tsx`;
- `PayeeManagementPage.tsx`;
- `SettingsPage.tsx`;
- `ScheduledTransactionsPanel.tsx`;
- `accountRegisterService.ts`;
- `BudgetPage.tsx`;
- `globals.css`;
- `register.css`.

Prefer feature-led extraction during Transaction Entry, Register, Settings and Budget work over a standalone large rewrite.

Also review:

- dependency/configuration drift;
- workspace/package boundaries;
- explicit versus transitive dependencies;
- route/navigation integrity;
- error semantics;
- server/runtime configuration;
- operational/security hygiene.

Known bounded defect candidates to verify/fix include:

- the Dashboard `/budgets` link currently relying on wildcard redirect instead of an intentional route;
- unknown server exceptions defaulting to HTTP 400 rather than 500;
- oversized request bodies returning a more appropriate HTTP status;
- long-running in-memory login rate-limit bookkeeping;
- User Management distinguishing authorization failure from server/load failure.

## Track 5 — Runtime and Toolchain Currency: Node.js 24

Evaluate moving the development/runtime/CI baseline from Node.js 22 to Node.js 24 LTS.

Required validation:

1. install/test with the current Node 24 LTS line;
2. run `pnpm verify`;
3. run the large projection/local-first performance benchmarks;
4. verify `better-sqlite3`, Playwright, Vite, worker and server behaviour;
5. update CI from Node 22 to Node 24 if validation passes;
6. update the root `engines.node` policy;
7. update developer documentation;
8. update the VM NVM runtime;
9. update the `budget-app-dev.service` PATH, which currently points at the Node 22 NVM directory;
10. restart and re-verify the systemd development service.

Do not make Node 24 adoption a blind version bump. Treat it as a bounded runtime migration with full verification evidence.

## Track 6 — Full Application Adaptive / Mobile / UI Scalability Audit

This is broader than the existing Adaptive Register task. Review the **entire product** before significant new UX work so new Transaction Entry/Register work is designed against real responsive constraints.

Test representative widths and form factors:

- large desktop;
- normal desktop/laptop;
- compact desktop;
- tablet landscape;
- tablet portrait;
- narrow/mobile landscape;
- mobile portrait;
- increased browser zoom / larger text.

Review across:

- application shell/navigation;
- Budget Manager;
- Dashboard;
- Budget workspace;
- Account Register;
- transaction creation/editing;
- splits/transfers;
- Scheduled Transactions;
- import review;
- Payee Management;
- Settings;
- Reports;
- User Management;
- dialogs;
- menus/floating UI;
- toasts/errors;
- attachments.

Evaluate:

- layout overflow and clipping;
- horizontal-scroll dependence;
- information density;
- table/column collapse strategy;
- sticky/fixed positioning;
- virtualisation at narrow widths;
- touch targets and touch-only interaction;
- hover-only assumptions;
- keyboard/focus order;
- soft-keyboard behaviour;
- viewport-edge placement;
- safe use of modals/sheets/menus;
- truncation/wrapping;
- text scaling;
- portrait/landscape transitions;
- large-data plus small-screen behaviour;
- accessibility at each breakpoint.

Deliverable:

- a page/flow-by-flow adaptive UX findings matrix;
- severity/priority for each issue;
- a clear distinction between global responsive infrastructure and feature-specific fixes;
- an implementation sequence feeding Phase 3A, 3B, Budget, Settings and reporting work.

Later browser coverage should include real-device/browser validation, especially iOS Safari and Android Chromium, once the responsive fixes are implemented.

## Track 7 — Roadmap and Feature Reconciliation

Reconcile source code against roadmap status before adding new features.

Already-existing foundations that must not be described as wholly future work include:

- Reporting foundation;
- Spending by Category report;
- Budget vs Actual report;
- Dashboard net-worth trend/monthly financial summary;
- authentication and sessions;
- multi-user account creation;
- budget membership roles/authorization;
- User Management;
- category goal/target foundations;
- restore points, backup/recovery and sync recovery infrastructure.

Remain genuinely outstanding or incomplete:

- dedicated Net Worth report;
- dedicated Income & Expenses report;
- broader reports/saved report configurations;
- full multi-user productisation and role/member-management UX;
- password/account lifecycle UX;
- broader savings planning beyond existing category-goal foundations;
- production deployment/productisation.

## Codebase Health Exit Criteria

This close-out is complete when:

- every accepted defect has either been fixed or deliberately scheduled;
- compatibility/dead-code candidates have evidence-backed dispositions;
- canonical documentation matches current architecture;
- generated persistence audit signals are trustworthy;
- Node 24 has a documented adopt/defer decision backed by verification;
- the full-app adaptive/mobile findings matrix exists;
- roadmap feature statuses match the actual implementation;
- no speculative architecture rewrite has been introduced.

---

# Subsystem Close-Out Reviews

After the Codebase Health and Scalability Close-Out, perform the two bounded subsystem review tracks below.

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

After the Codebase Health/Scalability close-out and the two subsystem close-out reviews above:

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

Implement the Register-specific findings from the earlier **Full Application Adaptive / Mobile / UI Scalability Audit**. Refine one coherent Register model across:

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
- budget duplicate/clone;
- Start Fresh from an existing budget while preserving selected structure such as accounts, categories, goals and schedules;
- archive/trim-history workflows where safe and useful;
- template-from-budget capability if user value justifies it.

These lifecycle tools should build on existing backup/restore/export integrity rather than inventing alternate persistence paths.

## Transaction discovery

- All Transactions.
- richer saved search/filter workflows after the All Transactions model exists;
- **Saved Views / filter presets** for frequently reused transaction searches such as uncategorised, uncleared, large transactions, tags, payees, date periods or review queues.

Saved Views should be built on the same query/filter model as All Transactions rather than becoming separate bespoke screens.

## Reporting

Implemented foundations:

- Reports framework/navigation;
- Spending by Category report;
- Budget vs Actual report;
- Dashboard net-worth trend and monthly financial summary.

Outstanding:

- dedicated Net Worth report;
- dedicated Income & Expenses report;
- broader reports;
- saved report configurations;
- **customisable reporting dashboards/widgets** as a later evolution of saved report configurations, so future reports do not become isolated dead-end screens;
- optional financial-health metrics such as savings rate or Age-of-Money-style measures, only where the underlying definition is clear and useful.

## Rules and Automation

- saved transaction rules;
- payee/category automation;
- workflow automation beyond Scheduled Transactions;
- ensure future automatic bank-feed ingestion, if ever added, feeds through the same proposal/matching/provenance pipeline rather than creating a second import architecture.

## Planning

Existing foundation:

- category goal/target persistence and inspector/history foundations.

Outstanding:

- forecasting;
- broader savings planning beyond category goals;
- debt planning;
- **multicurrency feasibility** as a deliberate future domain investigation before any implementation.

Multicurrency would require explicit decisions for base currency, native account currency, transfers/conversion, historical exchange rates, reporting and import semantics. Do not add it casually as a display-only feature.

## Additional Product Candidates from Competitor Review

These are **candidates**, not near-term commitments. They should be considered when their owning area is reached and only promoted when user value justifies the complexity.

### High-value candidates

- **Scheduled Transaction Calendar** — owned by Scheduled Transactions UX.
- **Account Groups / custom sidebar organisation** — evaluate during broader Register/navigation UX.
- **Saved Views / filter presets** — after All Transactions.
- **Custom report dashboards/widgets** — after the core dedicated reports and saved report configurations.
- **Budget clone / Start Fresh / template workflows** — after core data portability and recovery UX are stable.
- **Shared-budget activity history** — later multi-user productisation; expose who added/edited/covered/reconciled where audit/history data supports it.
- **Developer API / CLI** — later power-user/self-hosting capability built on existing command/query boundaries and server control-plane architecture.
- **Privacy / scramble mode** — low-cost future usability/privacy feature for screenshots, diagnostics and support.

### Deliberate feasibility candidates

- **Multicurrency** — investigate as a domain-level feature before implementation.
- **Automatic bank sync** — later only; provider cost, credentials, pending/settled transitions, outages and duplicate identity make this materially more complex than file import.
- **PWA/mobile-install experience** — evaluate after the full adaptive/mobile audit and responsive fixes; do not use installability as a substitute for a genuinely good mobile UX.

### Product principle

Competitor parity is not a goal by itself. Prefer features that reinforce the existing local-first architecture, reduce repetitive user work, improve financial understanding or make the application easier to operate. Avoid cloning features that create a second source of truth or a parallel workflow for an already-solved problem.

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

Multi-user foundations already exist and should be treated as **partial**, not future-from-zero work. Existing foundations include authentication, sessions, administrator-created users, budget memberships/roles and User Management.

Later productisation includes:

- member/role management UX;
- user disable/delete/account lifecycle;
- password/reset/recovery flows;
- budget sharing/invitation UX where desired;
- **shared-budget activity history / attribution** where history data can support who changed what;
- authentication/authorisation hardening;
- security review;
- **Developer API / CLI** for supported automation, diagnostics, export/import and self-hosting workflows once the product command/query surface is stable.

AI remains a much later consideration and should not precede stable core workflows and automation foundations.

A lightweight **privacy/scramble mode** may be worthwhile earlier than AI: hide or deterministically replace sensitive balances/payees for screenshots, diagnostics and demonstrations without altering stored financial data.

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
- Responsive/mobile behaviour is a product correctness concern, not a final cosmetic pass.
- Runtime upgrades such as Node major changes require full verification rather than blind version bumps.

---

# Updated Near-Term Sequence

1. **Codebase Health close-out — dead/compatibility code, documentation, tests, bounded refactors, bugs, dependency/configuration and operational hygiene.**
2. **Node.js 24 validation and, if clean, runtime/CI/VM/systemd upgrade.**
3. **Full Application Adaptive / Mobile / UI Scalability Audit.**
4. Fix bounded defects/documentation/test issues proven by steps 1–3; record larger product findings in their owning phases.
5. **Importer close-out review.**
6. **Performance/navigation/tab-lifecycle close-out review.**
7. Fix only concrete defects found by those subsystem reviews.
8. Phase 3A — Transaction Entry UX, incorporating adaptive/mobile findings.
9. Phase 3B — broader Account Register UX.
10. Budget Screen UX review.
11. Shared application UX, including dialogs, toasts, validation, errors/recovery and attachments.
12. Settings UX review.
13. Phase 3C — Register customisation.
14. Phase 3D — adaptive Register implementation.
15. Scheduled Transactions product UX.
16. Targeted browser/E2E expansion alongside the workflows above.
17. Targeted CSS/global cleanup only where product work exposes concrete debt.
18. CSV export.
19. All Transactions.
20. Dedicated Net Worth / Income & Expenses / broader reporting.
21. Saved filters/report configurations.
22. Rules and automation.
23. Forecasting / broader savings planning / debt planning.
24. Evaluate account groups, scheduled calendar, Saved Views and budget lifecycle tools in their owning phases if not already completed.
25. Multicurrency feasibility review and automatic-bank-sync feasibility only if user value justifies the domain/operational complexity.
26. Review Overspending when its value justifies un-parking it.
27. Broader maintainability.
28. Production self-hosting / deployment refinement, multi-user productisation and shared activity history.
29. Developer API / CLI and other power-user integration surfaces.
30. Security / operational hardening and productisation.

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

**Status:** Foundational implementation complete. The remaining work is the bounded Import Workflow close-out review already defined above, including genuine-new-QIF acceptance and defect-focused fixes only.

## Phase 3 — Product UX — ACTIVE NEXT PROGRAMME

### Phase 3A — Transaction Entry UX — OUTSTANDING / NEXT MAJOR UX PHASE

Retain the earlier audit scope and expand the current Phase 3A definition to explicitly include:

- transaction creation and editing;
- initial focus and focus restoration;
- desktop field order and keyboard/Tab order;
- Enter / Escape behaviour;
- date entry;
- payee selection and creation;
- category selection and creation;
- transfers/account selection;
- inflow/outflow entry;
- split transactions;
- validation and save errors;
- Save;
- Save & Add Another;
- Cancel;
- post-save form reset;
- create/edit consistency;
- desktop layout;
- mobile/adaptive amount-first layout;
- accessibility;
- underlying duplicated/fragile state or implementation discovered by the audit.

The first action remains an audit of the current implementation. Work should then be split into bounded passes rather than one large PR.

### Phase 3B — Broader Account Register UX — OUTSTANDING

The current roadmap already includes interaction polish, row focus/edit clarity, selection, bulk actions, search/filter ergonomics, keyboard navigation, pagination/load-more experience and high-value E2E coverage. Preserve the older roadmap's additional emphasis on transaction/contextual actions, empty states and workflow consistency.

Also evaluate **Account Groups / custom sidebar organisation** as a bounded navigation feature: user-defined groups, reordering, collapse/expand and coherent placement of everyday, savings, debt, investment and tracking accounts. Do not let account grouping complicate the underlying account model unless the UX benefit requires it.

### Phase 3C — Register Customisation — OUTSTANDING

Still outstanding. Existing technical customisation foundations should become a coherent user-facing Customize Register experience covering column visibility, display/density choices, persistence, reset/default behaviour, accessibility and keyboard compatibility.

### Phase 3D — Adaptive Register — OUTSTANDING

Still outstanding. Theme/responsive infrastructure has improved, but the broader Register experience across large desktop, compact desktop, tablet and mobile remains a distinct product task.

### Reconciliation — DEFERRED

A full reconciliation workflow remains deferred and is not part of the immediate Register UX tranche.

## Phase 4 — Theme consistency — COMPLETE FOR AGREED SCOPE

Theme Passes 1–3.5 are considered complete for the agreed scope:

- Theme Pass 1 — initial theme consistency;
- Theme Pass 2 — visual consistency/remediation;
- Theme Pass 3.1 — Scheduled Transactions CSS ownership;
- Theme Pass 3.2 — Register header/floating UI ownership;
- Theme Pass 3.3 — Budget theme ownership;
- Theme Pass 3.4 — Budget responsive ownership / `!important` cleanup;
- Theme Pass 3.5 — Blueprint Budget feature-selector reduction.

Retired high-risk repair layers include `scheduledTransactionsTheme.css`, `registerHeaderFixes.css`, `darkThemePolish.css` and `budgetResponsivePolish.css`. Budget responsive layout no longer depends on inline-style-versus-`!important` fights, and Blueprint no longer directly owns Budget feature selectors.

**Status:** Complete for product-blocking scope. Remaining `globals.css` / `register.css` debt belongs to later maintainability work.

## Testing / CI infrastructure — STRONG BASELINE; EXPANSION OUTSTANDING

The earlier roadmap recorded a required suite of 179/179 files and focused ownership regressions after the theme passes. Subsequent performance work added browser performance evidence, bundle budgets and exact-head CI/VM acceptance expectations.

**Status:** Core CI baseline established. Browser/E2E expansion remains outstanding and should be added alongside the product flows it protects rather than pursued as an isolated test project. Priority workflows include transaction entry/editing, transfers, splits, Register customisation, Budget interactions, overspending, imports and destructive operations. Any recurring Cover Overspending Playwright setup flake should be hardened when reproduced.

## Budget / Overspending — PARTLY COMPLETE

### Budget Screen UX — OUTSTANDING

Theme ownership, responsive ownership and Budget virtualization are complete foundations, but the broader Budget Screen UX review remains outstanding: hierarchy, editing, keyboard/focus flow, groups, large-budget usability, adaptive/mobile layout and selective E2E coverage.

### Cover Overspending — IMPLEMENTED; DO NOT RE-OPEN AS AN UNFINISHED FEATURE

The older roadmap described multi-source Cover Overspending as major outstanding work, including explicit source amounts and remaining-amount validation. Later work has superseded that status: the current roadmap records **Cover Overspending — implemented**.

Treat its existing implementation as the baseline. Re-open it only for concrete defects or as part of a future bounded UX review.

### Overspending policy/category settings — IMPLEMENTED

Also recorded as implemented.

### Review Overspending — PARKED

This remains the outstanding broader overspending workflow and should stay parked unless evidence or user value makes it a priority.

## Scheduled Transactions UX — PARTLY COMPLETE

CSS/theme ownership is complete. Product UX remains later work: create/edit flow, recurrence language, due/overdue clarity, preview/entry relationship, Enter/Skip workflows and adaptive/mobile presentation.

Add a **Scheduled Transaction Calendar** as a high-value candidate for this phase. It should reuse the existing schedule/preview/Enter/Skip model rather than introduce a second scheduling authority. The calendar should make upcoming income/bills, funding state, due/overdue state and actions such as Enter now, Skip and Edit schedule easy to understand on desktop and mobile.

## Shared application UX — OUTSTANDING

Preserve the earlier scope and the current roadmap's cross-cutting polish:

- dialog consistency;
- toast behaviour;
- validation;
- shared error/recovery presentation;
- loading/empty/error states;
- settings consistency;
- attachment UX;
- keyboard/accessibility;
- responsive consistency.

Do this after the major transaction/Register/Budget workflows rather than as abstract component cleanup first.

## Settings UX — OUTSTANDING

The earlier roadmap called for a dedicated Settings UX review. This was not explicitly retained as its own heading in the later roadmap, so it is restored here as a distinct product task under shared application polish.

## Phase 5 — Browser / E2E expansion — PARTIAL / ONGOING

Browser performance evidence exists and targeted regressions have grown, but workflow-level E2E coverage is not complete. Expand it incrementally alongside Phase 3 and later Budget/Settings work.

## CSS consolidation — SUBSTANTIALLY IMPROVED; LATER MAINTAINABILITY

The high-risk theme repair layers are gone. Remaining work is non-blocking:

- reduce historical sections in `globals.css`;
- move true feature ownership out of globals;
- reduce `register.css` size/specificity;
- extract genuinely shared styles/components;
- remove residual stylesheet ordering dependencies.

Do not resume broad CSS cleanup before the major product UX tranche unless current work exposes a concrete ownership problem.

## Phase 7 — Broader maintainability — OUTSTANDING / LATER

A bounded Codebase Health close-out now occurs before Phase 3A to remove proven residue, correct documentation/test signals and identify defects. That does **not** turn into an open-ended refactor programme.

Broader maintainability remains intentionally later than the important UX baselines. Use product work to expose real maintainability pain rather than starting another architecture-cleanup programme speculatively.

## Phase 8 — Major product features — MIXED STATUS

- CSV export — outstanding.
- Actual Budget importer — **completed**; remove from the future-feature queue.
- All Transactions — outstanding.
- Reporting foundation — implemented.
- Spending by Category — implemented.
- Budget vs Actual — implemented.
- Dashboard net-worth/monthly financial summary — implemented.
- dedicated Net Worth report — outstanding.
- dedicated Income & Expenses report — outstanding.
- broader reports — outstanding.
- saved filters/report configurations — outstanding.
- rules / automation — outstanding.
- forecasting — outstanding.
- category goal/target foundation — implemented/partial.
- broader savings planning beyond category goals — outstanding.
- debt-management/planning — outstanding.

The older ordering of CSV export then Actual Budget importer is therefore obsolete because Actual Budget import has already shipped.

## Phase 9 — Self-host / deployment / multi-user — PARTIAL

Initial development-service operability is now complete: the Budget App development stack runs under a persistent systemd user service with lingering enabled, so keeping PuTTY/SSH open is no longer required.

Multi-user foundations are also already implemented in part: authentication, sessions, administrator-created users, budget membership roles/authorization and a User Management page exist.

The remaining self-hosting work is broader production-style deployment and operations: production serving, configuration, reverse proxying where useful, deployment/upgrades, backup/restore, diagnostics/observability, documentation and optional packaging. Remaining multi-user work is productisation/hardening rather than implementation from zero.

## Phase 10 — Security / hardening — OUTSTANDING AS A LARGER PHASE

Still later productisation work, alongside authentication/authorisation hardening, security review, backup/restore operational UX, deployment/upgrades, diagnostics, observability and operational documentation. Individual correctness/security defects should still be fixed immediately when discovered.

# Reconciled Working Order

Initial development-service hosting is already complete and should be treated as an established operating baseline, not a future item. Further low-risk deployment improvements may be taken opportunistically without blocking the active UX programme.

The combined roadmap now resolves to:

1. Codebase Health close-out: obsolete/compatibility code, documentation, tests, bounded refactors, obvious defects, dependencies/configuration and operational/security hygiene.
2. Node.js 24 validation and upgrade if the full verification/benchmark evidence is clean.
3. Full Application Adaptive / Mobile / UI Scalability Audit.
4. Fix bounded issues proven by the first three reviews; route larger findings into their owning product phases.
5. Import Workflow close-out review.
6. Performance / navigation / tab-lifecycle close-out review.
7. Fix only concrete defects found by those subsystem reviews.
8. Phase 3A — Transaction Entry UX audit and bounded implementation passes.
9. Phase 3B — broader Account Register UX.
10. Budget Screen UX review.
11. Shared application UX, including dialogs, toasts, validation, errors/recovery and attachments.
12. Settings UX review.
13. Phase 3C — Register customisation.
14. Phase 3D — adaptive/responsive Register implementation using the full-app audit findings.
15. Scheduled Transactions product UX.
16. Targeted browser/E2E expansion alongside the workflows above, including mobile/browser coverage where practical.
17. Targeted CSS/global cleanup only where product work exposes concrete debt.
18. CSV export.
19. All Transactions.
20. Dedicated Net Worth / Income & Expenses / broader reporting.
21. Saved filters/report configurations.
22. Rules and automation.
23. Forecasting / broader savings planning / debt planning.
24. Review Overspending when its value justifies un-parking it.
25. Broader maintainability.
26. Production self-hosting / deployment refinement and multi-user productisation.
27. Security / operational hardening and productisation.

This sequence supersedes the older roadmap wherever later completed work has changed status. In particular, Actual Budget import and Cover Overspending must not be accidentally reintroduced as unimplemented features.
