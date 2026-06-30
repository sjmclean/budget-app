# v2.38.2 Register Amount Column Experiment

This release prototypes a single signed Amount column in the register display.

## Decisions

- Register display now shows one `Amount` column instead of separate `Outflow` and `Inflow` columns.
- Outflows are displayed as negative amounts.
- Inflows are displayed as positive amounts.
- Positive and negative amounts use subtle semantic colouring.
- Transaction entry and edit rows still use separate `Outflow` and `Inflow` fields.

## Reasoning

The register is primarily a reading surface. A single signed amount column reduces horizontal clutter and makes half-width layouts easier to scan, while preserving the explicit entry workflow for users adding or editing transactions.
