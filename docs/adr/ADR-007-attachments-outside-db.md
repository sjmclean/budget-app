# ADR-007: Store Attachments Outside SQLite

## Status

Accepted

## Context

Receipts and documents can become large and should not slow every database operation.

## Decision

Store attachment files under `Attachments/` and keep metadata in SQLite.

## Consequences

The app must validate paths and maintain attachment integrity metadata.
