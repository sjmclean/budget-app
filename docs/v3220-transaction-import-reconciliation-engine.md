# v3.22.0 Transaction Import Reconciliation Engine

Transaction matching now lives in a dedicated deterministic reconciliation module.

The engine accepts one immutable parsed transaction, the current register rows,
merchant resolution metadata, and transaction IDs already consumed by earlier
rows. It returns the ranked candidates, selected match, evidence, reason,
confidence, recommendation, and final `exact-match` or `new` decision.

Parsing, validation, proposal editing, duplicate-file recovery, review state and
persistence remain separate concerns. Existing public matching exports remain
available through `transactionImport.ts` for compatibility.
