# ADR-003: Folder-style `.budget` Package

## Status

Accepted

## Context

A single monolithic ZIP-like budget file was considered, but attachments and SQLite writes could make it slow and fragile.

## Decision

Use a folder-style package with `budget.db`, `budget.json`, `Attachments/`, `Backups/`, and `Temp/`.

## Consequences

SQLite remains fast and attachments can sync independently. The UI should present the folder as one budget package.
