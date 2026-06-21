# v1.29 Account + Payee Storage Extraction

This release removes direct browser `localStorage` ownership from the account and payee feature services.

## Changed

- `accountService` now accepts a `KeyValueStoragePort` dependency.
- `payeeService` now accepts a `KeyValueStoragePort` dependency.
- The browser-localStorage gateway now constructs account and payee services with `browserLocalStorageKeyValueStorage`.
- Existing storage keys and persisted data format are unchanged.

## Not changed

- No SQLite adapter is introduced yet.
- No account or payee behaviour should change.
- Budget activity persistence still lives under the browser-localStorage persistence layer and is expected to read localStorage until the SQLite adapter work begins.

## Why

After v1.28, register, scheduled transaction, and budget view services used injected storage, but account and payee services still reached directly into `window.localStorage`. This release completes that cleanup for the remaining account/payee feature services so direct browser storage access is isolated under persistence-layer wiring.
