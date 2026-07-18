# v3.23.1 Actual-style import reconciliation

Transaction import reconciliation now follows a deterministic, Actual Budget-inspired pipeline:

1. Candidate rows must have the same signed amount and be within seven days of the bank date.
2. Candidates resolving to the same canonical merchant are listed first.
3. Candidates are then ordered by closest date, normalised payee similarity, date and stable ID.
4. The first unused candidate is selected as the match.
5. The importer exposes only matched or new outcomes; there is no possible-match state or confidence score.
6. When multiple eligible register rows exist, the review screen shows a plain register-row selector. The best candidate is preselected and alternatives remain in deterministic order without stars, scores or recommendation labels.
7. Selecting another register row changes the inherited payee, category, memo and split structure to that row. The bank payee remains preserved in the import lifecycle.
8. Register rows already selected by another import row are disabled in the selector to preserve one-to-one reconciliation.
