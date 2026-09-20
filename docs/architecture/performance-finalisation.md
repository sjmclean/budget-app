# Performance finalisation

This tranche closes the measurement and edge-latency gaps left after P0.4–P0.8.

## Runtime changes

- Startup authentication status is fetched once and shared with `AuthGate`.
- Ordinary local-first budget capability/status reads come from the already-open
  SQLite generation and never query the relay.
- Normal background convergence no longer runs a health probe or a separate
  remote budget-status bootstrap before synchronization. Budget metadata is
  published only when name/currency changes. Explicit health checks remain
  available for diagnostics.
- Optional Account Register tools (transaction import, attachment manager, tag
  manager) are lazy chunks rather than part of the primary register route.
- Workspace startup prefetches the cheap authoritative SQLite account identity
  list immediately after budget activation. The sidebar renders those identities
  first, then shares P0.5's account-navigation query with other consumers for
  balances and uncategorised indicators instead of issuing a duplicate read.
- Scheduled-transaction maintenance uses the cheap account identity read and
  does not run a redundant local-first capability/status probe during startup.

## Evidence

CI retains three complementary forms of performance evidence:

1. P0.6 native-SQLite projection replay at 50k and 250k transactions.
2. The production local-first convergence loop over a persisted SQLite outbox and cursor store, covering push/ack and deterministic remote pull/apply at 20k and 100k local mutations.
3. A Chromium/OPFS smoke that creates a real 10k-transaction SQLite generation
   across multiple accounts, reopens it through the production worker, and
   measures cheap account-identity loading, full account-navigation enrichment,
   and a bounded 150-row register bootstrap.

The browser thresholds are deliberately generous regression tripwires, not UX
targets. Machine-to-machine timing variance must not become an architecture
correctness signal.

## Bundle budgets

The global bundle ceilings are tightened from the pre-finalisation guardrails,
and the Account Register route receives its own raw JavaScript budget. This
register-specific measurement is the full static route graph that is not
already part of the application entry graph, rather than only the emitted
`AccountRegisterPage` file.

On Verify #196 the post-split Register graph measured 380.5 KiB raw while the
route chunk itself measured 158.1 KiB. The initial 320 KiB graph ceiling was
therefore below the measured post-split baseline rather than evidence of a
bundle regression. The calibrated ceiling is 430 KiB, leaving about 13% raw
headroom while still catching meaningful re-bundling of optional tools.

Optional register workflows should remain lazy feature-boundary chunks instead
of being pulled back into the Register static graph. The core rows/editor and
their statically required dependencies can remain immediately available.
