# PROJECT HANDOVER MASTER - PART 2

## Repository Architecture

### High-Level Layering

Presentation (React/Vite) ↓ Feature Controllers / Services ↓ Domain
Models ↓ Persistence ↓ Portable Budget Package

Design rule: business rules belong in services/domain, never React
components.

## Core Subsystems

### Budget Engine

Responsibilities - Ready To Assign - Monthly budgeting - Rollovers -
Credit card payment handling - Overspending detection - Budget activity
calculation

Guiding principles - Correctness over cleverness. - Category IDs are
immutable identities. - Budget calculations should be deterministic.

### Register Engine

Responsibilities - Transaction lifecycle - Split transactions - Running
balances - Reconciliation - Bulk operations - Tags - Attachments
(future)

Architectural rule

The Register owns persisted transactions.

No caller should assume it can safely insert without validation.
Persistence is the final authority for integrity.

## Scheduled Transactions

Recent evolution

v2.65 - Initial generation engine

v2.94 - Materialisation fidelity - Category ID preservation - YNAB4
scheduled import fidelity

v2.94.1 - Persistence-level idempotency - Duplicate occurrence
prevention

Pinned enhancements

-   Weekend handling
-   End after X occurrences
-   End on date
-   Rich recurrence model
-   Skip occurrence
-   Postpone occurrence

## Import Philosophy

Supported / Planned

-   QIF
-   CSV
-   YNAB4
-   Actual Budget

Future - Additional import adapters

Golden rule

Importers translate into the internal model.

Never let importer concepts leak into the application.

## UX Philosophy

The application targets desktop productivity.

Common actions should be immediately available.

Rare actions should live in management screens.

Pinned UX reviews

-   Budget screen declutter
-   Register header review
-   Transaction entry simplification
-   Category management extraction

## Roadmap Snapshot

Near term - Scheduled transaction UX - Tag picker - Budget activity
explorer

Medium term - Merchant Knowledge - Reports - Planning

Long term - Cloud sync - Mobile - Goals - Multi-user conflict handling

## ADR Candidates

ADR-007 Inline tag creation ADR-008 Weekend schedule policy ADR-009
Portable package synchronisation ADR-010 Merchant Knowledge subsystem
ADR-011 Import abstraction ADR-012 Register persistence authority

End of Part 2.
