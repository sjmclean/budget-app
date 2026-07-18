# v3.22.7 Import Commit Plan Verification

The importer now performs a deterministic whole-plan verification after building
additions, matched updates, and staged Merchant Knowledge, but before any
register mutation begins.

The verifier checks cross-candidate and whole-plan invariants including:

- destination account availability;
- imported and matched candidate separation;
- completed identity coverage;
- unique matched register transactions and updates;
- valid one-sided transaction amounts;
- transfer destination and category integrity;
- Ready to Assign and normal category references;
- non-negative import statistics.

Verification failures raise `ImportCommitValidationError` during the existing
`Validate commit plan` stage. No register write begins when verification fails.
The structured verifier is exported for behavioural regression testing and
future developer diagnostics.
