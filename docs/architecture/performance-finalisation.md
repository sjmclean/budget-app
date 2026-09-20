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

## Evidence

CI retains three complementary forms of performance evidence:

1. P0.6 native-SQLite projection replay at 50k and 250k transactions.
2. Local-first outbox/relay batching at 20k and 100k mutations.
3. A Chromium/OPFS smoke that creates a real 10k-transaction SQLite generation,
   reopens it through the production worker, and measures a bounded 150-row
   register bootstrap.

The browser thresholds are deliberately generous regression tripwires, not UX
targets. Machine-to-machine timing variance must not become an architecture
correctness signal.

## Bundle budgets

The global bundle ceilings are tightened from the pre-finalisation guardrails,
and the Account Register route receives its own raw JavaScript budget. Optional
register tools should be split instead of allowing the primary route chunk to
grow without bound.
