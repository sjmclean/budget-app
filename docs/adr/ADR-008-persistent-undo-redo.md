# ADR-008: Persistent Command-based Undo/Redo

## Status

Accepted

## Context

Users need recovery from mistakes, and local-first budgets should retain undo state across app restarts.

## Decision

Use persistent command history with explicit undo and redo payloads.

## Consequences

New mutating workflows should define undo/redo behaviour and tests.
