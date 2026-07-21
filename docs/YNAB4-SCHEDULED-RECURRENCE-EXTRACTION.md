# YNAB4 scheduled recurrence extraction

This update moves YNAB4 scheduled-frequency decoding out of the browser launcher and into the importer package.

## Boundary

`mapYnab4Recurrence` now owns:

- standard YNAB4 frequency aliases;
- explicit `Every N days/weeks/months/years` rules;
- the existing monthly fallback when no recurrence value is present;
- rejection of unsupported non-uniform rules such as twice-monthly.

The launcher remains responsible for mapping complete scheduled transactions. This is an intentionally narrow extraction with no intended import-behaviour change.

## Tests

The feature suite covers standard aliases, custom intervals, the missing-value fallback, and unsupported rules.
