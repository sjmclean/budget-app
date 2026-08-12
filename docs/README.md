# Documentation

This repository keeps a small set of current human-facing architecture documents.

## Current documentation

- `application-architecture.md` — runtime structure, application boundaries, and major subsystems.
- `persistence-and-sync.md` — local-first SQLite persistence, replication, baselines, epochs, and relay behaviour.
- `financial-engine.md` — authoritative budgeting projection and financial calculation rules.
- `import-and-data-integrity.md` — imports, reconciliation, provenance, matching, and commit guarantees.
- `operations-and-recovery.md` — backup, restore, deletion, diagnostics, recovery, and operational integrity.

## Detailed architecture

`architecture/` contains lower-level architecture documents, generated persistence
audits, and subsystem contracts. Some of these documents are validated directly
by repository scripts and tests.

The primary architecture entry point is:

- `architecture/README.md`

Generated persistence audit outputs are:

- `architecture/persistence-audit-phase-1.md`
- `architecture/persistence-audit.json`

Regenerate them with:

    pnpm audit:persistence

## Architecture decision records

`adr/` contains architectural decision records. ADRs are historical decision
records and may describe constraints or implementation choices that were later
superseded.

They should be read as decision history, not automatically as current runtime
documentation.

## Documentation policy

Current architecture belongs in the canonical documents listed above or in
`architecture/`.

Do not create release-by-release prose documentation for implementation
milestones. Git history, tests, and source control preserve that history.

When architecture changes:

1. update the relevant canonical document;
2. update any machine-validated architecture document affected by the change;
3. update or add an ADR only when recording a meaningful architectural decision;
4. avoid duplicating the same contract across multiple documents.
