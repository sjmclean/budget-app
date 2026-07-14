# PROJECT HANDOVER MASTER --- PART 20

# Architecture Decision Record (ADR) Compendium

## Purpose

This document captures the major architectural decisions made during
development. Each ADR records the decision, rationale, alternatives
considered, consequences, and current status.

------------------------------------------------------------------------

## ADR-001 --- Canonical Internal Data Model

**Decision:** All imports (YNAB4, Actual, CSV, QIF and future formats)
are translated into a single internal model.

**Why:** Prevent importer-specific logic spreading throughout the
application.

**Status:** Adopted.

------------------------------------------------------------------------

## ADR-002 --- Register Is the Source of Truth

Budget calculations derive from the register ledger rather than
maintaining multiple competing transaction stores.

Status: Adopted.

------------------------------------------------------------------------

## ADR-003 --- Local-First Architecture

Budgets belong to the user and operate offline. Cloud services act only
as transport for portable budget packages.

Status: Adopted.

------------------------------------------------------------------------

## ADR-004 --- Portable Budget Package

A complete budget (database, metadata, attachments and sync state)
should be portable as a single package.

Status: Planned.

------------------------------------------------------------------------

## ADR-005 --- Merchant Knowledge Subsystem

Merchant aliases, defaults and learning remain a dedicated subsystem
rather than being embedded inside importers.

Status: Pinned roadmap.

------------------------------------------------------------------------

## ADR-006 --- Regression-First Engineering

Every defect should ideally produce a regression test before or
alongside the fix.

Status: Adopted.

------------------------------------------------------------------------

## ADR-007 --- Idempotent Scheduled Transactions

Scheduled transaction generation must be idempotent. Running generation
multiple times must never create duplicate transactions.

Status: Adopted following duplicate-generation fixes.

------------------------------------------------------------------------

## ADR-008 --- Stable Identifiers

Use stable IDs wherever possible to preserve references across imports,
migration and future synchronisation.

Status: Adopted.

------------------------------------------------------------------------

## ADR-009 --- Progressive Disclosure UI

Frequently-used actions remain visible. Rare or destructive actions move
into secondary menus or management screens.

Status: Adopted.

------------------------------------------------------------------------

## ADR-010 --- Desktop-First, Mobile-Friendly

Desktop receives advanced workflows (context menus, keyboard shortcuts)
while mobile keeps simplified access to the same capabilities.

Status: Adopted.

------------------------------------------------------------------------

## ADR-011 --- Financial Correctness Over Cosmetic Behaviour

Financial accuracy always takes precedence over appearance or
convenience.

Status: Core principle.

------------------------------------------------------------------------

## ADR-012 --- Provider-Agnostic Synchronisation

Dropbox, Google Drive and iCloud should be interchangeable transports.
The sync engine must not depend on a specific vendor.

Status: Planned.

------------------------------------------------------------------------

## ADR-013 --- Transparent Automation

Automation and future AI should recommend actions, never silently alter
financial records.

Status: Planned.

------------------------------------------------------------------------

## ADR-014 --- Expand Through Engines

Major functionality should be implemented as coherent engines/subsystems
rather than isolated features.

Current engines: - Budget - Register - Reporting - Import/Export -
Planning (future) - Merchant Knowledge (future)

------------------------------------------------------------------------

## ADR-015 --- Preserve User Intent During Migration

Imports should preserve categories, aliases, merchant behaviour and
budgeting intent whenever source data permits.

Status: Adopted.

------------------------------------------------------------------------

## Decision Index

  ADR   Topic                    Status
  ----- ------------------------ ---------
  001   Canonical model          Adopted
  002   Register truth           Adopted
  003   Local-first              Adopted
  004   Portable packages        Planned
  005   Merchant Knowledge       Pinned
  006   Regression-first         Adopted
  007   Idempotent schedules     Adopted
  008   Stable identifiers       Adopted
  009   Progressive disclosure   Adopted
  010   Desktop/mobile           Adopted
  011   Financial correctness    Core
  012   Provider-agnostic sync   Planned
  013   Transparent automation   Planned
  014   Engine architecture      Adopted
  015   Migration fidelity       Adopted

End of Part 20.
