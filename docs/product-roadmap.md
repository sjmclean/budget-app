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
