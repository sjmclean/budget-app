# Milestone 4 Phase 6: SQLite attachments

Transaction attachments in local-first budgets are stored in
`local_transaction_attachments`. Register queries read only bounded metadata;
the BLOB is fetched from the worker when the user opens or downloads a file.

Attachment writes and deletes are committed atomically with an outbox entry.
They use the `transactions` relay domain with an attachment-scoped entity key,
so an attachment mutation cannot replace its parent transaction mutation.
Content is included in the attachment mutation and the SQLite baseline. Pushes
are byte-bounded and pulls use small pages to prevent multiple maximum-sized
attachments from forming an unbounded JSON response.

SHA-256 is calculated before storage and checked again when content is read.
Deleting a transaction or account removes its attachment rows through SQLite
foreign-key cascades. The legacy IndexedDB attachment path remains available
only for legacy, non-SQLite budgets.

Run:

```sh
pnpm test:milestone4:sqlite-attachments
pnpm verify:milestone4:sqlite-attachments
```
