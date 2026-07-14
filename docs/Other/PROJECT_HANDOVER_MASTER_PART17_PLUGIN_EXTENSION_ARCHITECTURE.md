# PROJECT HANDOVER MASTER --- PART 17

# Plugin, Extension & Integration Architecture

## Purpose

This document defines how the Budget App can grow through integrations
while keeping the core financial engine stable, deterministic and
independent.

------------------------------------------------------------------------

# Architectural Philosophy

The core application should expose stable extension points rather than
allowing integrations to modify business logic directly.

Principles:

-   Core-first
-   Loose coupling
-   Stable interfaces
-   Backward compatibility
-   Provider independence

------------------------------------------------------------------------

# Integration Layers

The application is divided into:

1.  Core Financial Engine
2.  Internal Services
3.  Integration Adapters
4.  External Providers

External providers communicate through adapters rather than directly
with the core engine.

------------------------------------------------------------------------

# Import Plugins

Current and future importers include:

-   CSV
-   QIF
-   YNAB4
-   Actual Budget
-   OFX/QFX
-   Open Banking

Each importer must map into the canonical data model.

------------------------------------------------------------------------

# Export Plugins

Future exports:

-   CSV
-   Excel
-   PDF
-   JSON
-   Portable Budget Package

Exports are read-only consumers of canonical data.

------------------------------------------------------------------------

# Cloud Providers

Supported providers should be interchangeable:

-   Dropbox
-   Google Drive
-   iCloud Drive
-   OneDrive
-   Synology Drive

Business logic must remain provider-agnostic.

------------------------------------------------------------------------

# Bank Integrations

Future bank connectivity should support:

-   transaction download
-   account balance refresh
-   institution metadata

Bank feeds should populate the Intake Engine rather than bypass it.

------------------------------------------------------------------------

# Receipt & OCR

Future integrations may include:

-   OCR engines
-   document scanners
-   PDF processing

Extracted data should always be reviewed before committing to the
ledger.

------------------------------------------------------------------------

# AI-Assisted Features

Potential future uses:

-   merchant categorisation suggestions
-   memo suggestions
-   duplicate detection assistance
-   anomaly detection
-   spending insights

AI may recommend actions but should not silently change financial data.

------------------------------------------------------------------------

# Event Architecture

Future internal events may include:

-   transaction created
-   transaction updated
-   month recalculated
-   report refreshed
-   scheduled transaction generated

Extensions should subscribe to events instead of modifying engine
internals.

------------------------------------------------------------------------

# Public API

Long-term API goals:

-   stable versioning
-   authenticated access
-   read/write separation
-   portable data formats

The API should mirror canonical entities.

------------------------------------------------------------------------

# Security

Extensions must not compromise:

-   user privacy
-   data ownership
-   financial correctness

Permissions should be explicit and minimal.

------------------------------------------------------------------------

# Testing

Every integration should have:

-   unit tests
-   regression tests
-   compatibility tests
-   migration tests where applicable

Core financial tests remain mandatory regardless of integration type.

------------------------------------------------------------------------

# Roadmap

Future extension points include:

-   Plugin SDK
-   Custom reports
-   Community importers
-   Bank provider adapters
-   Cloud storage adapters
-   Mobile extensions
-   AI assistants
-   Automation hooks
-   Webhook support

The extension architecture should enable ecosystem growth without
increasing coupling inside the financial engine.

End of Part 17.
