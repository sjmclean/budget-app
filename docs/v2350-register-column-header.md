# v2.35.0 Register Column Header

## Summary

Adds a visible register column header for the compact desktop register layout.

The desktop register already had column headings, but the compact desktop layout hid them. That made the register start with a month separator and transaction rows, leaving users to infer what each column represented.

## Behaviour

- Desktop layout keeps the existing resizable column header.
- Compact desktop layout now shows a dedicated header aligned to the compact row layout.
- Tablet/mobile card-style layouts remain unchanged.
- The attachment column is represented with a paperclip icon.

## Rationale

The month separator should communicate time grouping. The register header should communicate column meaning.

This also provides a foundation for future register work such as sticky headers, sorting, column menus, and transaction search state.
