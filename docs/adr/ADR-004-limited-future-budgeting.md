# ADR-004: Limited Future Budgeting

## Status

Accepted

## Context

Unlimited future budgeting complicates logic and can hide mistakes.

## Decision

Support configurable, limited future budgeting. Default maximum future months is controlled by budget settings.

## Consequences

Assignments beyond the limit are validation errors.
