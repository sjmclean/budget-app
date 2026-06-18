# ADR-001: Use SQLite as the Budget Database

## Status

Accepted

## Context

The app must be local-first, offline-capable, portable, and free of mandatory hosted infrastructure.

## Decision

Use SQLite for each budget package.

## Consequences

SQLite provides a fast, mature, file-based database that works well with local-first desktop/PWA designs. The app must be careful with migrations, backups, and file sync conflicts.
