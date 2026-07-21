# YNAB4 Import Finalisation Extraction

The completed-import record and commit phase have been extracted from
`ynab4LauncherImport.ts` into:

`apps/web/src/features/budget/ynab4/finaliseYnab4Import.ts`

The extracted module owns:

- the persisted YNAB4 launcher import record contract;
- record construction from discovery, preview, warnings, and audit results;
- the launcher import storage key;
- reading persisted import records;
- selecting and marking the imported budget as opened;
- persisting the completed import record; and
- returning the updated budget registry.

The launcher remains responsible for package validation, execution context
preparation, plan persistence, accuracy auditing, diagnostic logging, and
rollback orchestration.

No persistence keys, record fields, warning ordering, progress-step mapping,
or audit behaviour were intentionally changed.
