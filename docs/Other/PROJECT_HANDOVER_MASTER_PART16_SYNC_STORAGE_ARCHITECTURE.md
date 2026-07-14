# PROJECT HANDOVER MASTER --- PART 16

# Synchronisation, Storage & Multi-Device Architecture

## Purpose

This document defines the long-term storage and synchronisation
architecture for the Budget App.

## Core Principles

-   Local-first architecture
-   Portable budget package
-   User owns their data
-   Cloud-provider independence
-   Offline-first operation
-   Deterministic synchronisation

## Budget Package

The budget package is the sole source of truth and will ultimately
contain:

-   metadata
-   settings
-   accounts
-   categories
-   category groups
-   payees
-   tags
-   transactions
-   scheduled transactions
-   reports
-   merchant knowledge
-   attachments
-   sync metadata
-   audit metadata

## Storage

Supported storage locations include:

-   Local disk
-   NAS
-   Dropbox
-   Google Drive
-   iCloud Drive
-   OneDrive
-   Synology Drive

Cloud providers are transport mechanisms, not databases.

## Synchronisation

Responsibilities:

-   change detection
-   conflict detection
-   safe merge
-   recovery
-   corruption prevention

Financial calculations remain independent of synchronisation.

## Conflict Resolution

Future sync metadata may include:

-   device ID
-   lock owner
-   timestamps
-   revision IDs

Conflicts should always be visible rather than silently resolved.

## Multi-device

Target experience:

Desktop: - full budgeting

Mobile: - quick transaction entry - receipt capture

Tablet: - complete budgeting workflow

## Offline

Offline mode should support:

-   budgeting
-   register editing
-   reports
-   scheduled transactions

Synchronisation occurs once connectivity returns.

## Security

Future work:

-   optional encryption
-   integrity validation
-   encrypted attachments
-   password protection

## Performance

Large budgets should remain responsive through:

-   lazy loading
-   indexing
-   incremental synchronisation
-   efficient storage

## Roadmap

Pinned items:

-   Portable budget package
-   Dropbox support
-   iCloud investigation
-   Google Drive support
-   Conflict resolution UI
-   Sync status indicators
-   Backup verification
-   Future collaboration

End of Part 16.
