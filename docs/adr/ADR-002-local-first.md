# ADR-002: Local-first Architecture

## Status

Accepted

## Context

The target user wants data ownership, offline use, no subscription requirement, and no mandatory server.

## Decision

Design the backend so the canonical budget lives locally inside a `.budget` package.

## Consequences

The app can later add cloud sync, but core budgeting must not depend on a remote service.
