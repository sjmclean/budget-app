# ADR-006: File Sync First

## Status
Accepted

## Context
The user prefers Dropbox/OneDrive/iCloud/Google Drive style sync over maintaining a server.

## Decision
Design budget packages to work with ordinary file sync first. Provider APIs can be added later.

## Consequences
Lock files, fingerprints, backups, and conflict detection are important.
