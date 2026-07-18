# v3.22.2 Neutral Import Review UI

The transaction import review screen no longer presents confidence scores,
recommendation labels, or status badges for normal review rows.

Each review card now focuses on the information needed for a user decision:

- the transaction supplied by the bank file;
- a possible existing register transaction, when one exists;
- the editable transaction that will be added when importing as new;
- factual validation errors when source data is incomplete or invalid; and
- the available actions.

Internal reconciliation evidence and ranking remain available to the importer
engine, but they are not presented as a recommendation to the user.
