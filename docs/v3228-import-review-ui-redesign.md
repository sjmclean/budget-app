# v3.22.8 Import Review UI Redesign

This milestone restructures the transaction importer around a four-step flow: File, Setup, Review, and Complete.

- The destination account is visible before file selection.
- CSV column roles are auto-detected and remain editable; assigning a role moves that role from any previously mapped column.
- QIF date and amount formats are auto-detected and shown in an editable setup step.
- OFX/QFX statement details remain a confirmation setup step.
- Review retains the fast A/B Bank/Register comparison only for possible matches.
- New transactions use one row only, with payee/category editing controls underneath.
- Transfers use one transaction row with a factual account route.
- Invalid rows remain red and link back to file settings.
- Positive amounts remain green and negative amounts remain red.
- Card-level Enter no longer makes an implicit import decision.
