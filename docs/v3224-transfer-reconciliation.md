# v3.22.4 — First-class transfer reconciliation

Transaction imports now treat transfers as a distinct reconciliation outcome.

- QIF transfer destinations are carried into the immutable import lifecycle.
- Transfer destinations are resolved by account identity before ordinary payee matching.
- Existing matches must already be linked to the intended destination account.
- Same-amount ordinary transactions cannot be consumed as transfer matches.
- Missing destinations remain factual validation errors.
- New transfers continue through the register service, which creates the linked counterpart.

This change does not add confidence or recommendation labels to the review UI. The UI shows the factual transfer route and retains user-controlled import, match and skip actions.
