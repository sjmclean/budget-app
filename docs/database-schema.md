# Database Schema

The database is SQLite, defined in `packages/database/src/schema.ts` and initialized in `packages/database/src/initDatabase.ts`.

## Integrity approach

SQLite foreign keys are enabled during database initialization. v1.2.14 also includes a foreign-key migration plan because the current schema still relies on a mix of database constraints, indexes, and application-level guards. This staged approach avoids risky migrations while the data model is still evolving.

## Main tables

| Table                                               | Purpose                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `budgets`                                           | Top-level budget record. Each `.budget` package normally contains one logical budget.                   |
| `budget_metadata`                                   | Package/budget metadata such as version, owner, and descriptive details.                                |
| `budget_settings`                                   | Per-budget settings such as currency, month format, max future months, backup, and attachment settings. |
| `budget_months`                                     | Monthly budget-level values such as income/ready-to-assign state.                                       |
| `category_groups`                                   | Parent grouping for categories.                                                                         |
| `categories`                                        | Envelope categories used for budgeting and transaction categorisation.                                  |
| `category_months`                                   | Per-category monthly assigned/activity/available values.                                                |
| `category_settings`                                 | Display and behaviour settings for categories.                                                          |
| `accounts`                                          | Budget and tracking accounts. Includes type, participation, and balances.                               |
| `account_settings`                                  | Display/hidden/closed/reconciliation settings for accounts.                                             |
| `payees`                                            | Payee names and transfer-payee references.                                                              |
| `payee_rules`                                       | Persisted auto-categorisation and payee matching rules.                                                 |
| `transactions`                                      | Register transactions, including transfers and deleted state.                                           |
| `split_transaction_lines`                           | Split transaction line items.                                                                           |
| `transaction_flags`                                 | User-visible transaction flags.                                                                         |
| `transaction_tags`                                  | Tag definitions.                                                                                        |
| `transaction_tag_assignments`                       | Many-to-many link between transactions and tags.                                                        |
| `transaction_notes`                                 | Transaction notes/comments.                                                                             |
| `transaction_attachments`                           | Attachment metadata; actual files live in `Attachments/`.                                               |
| `scheduled_transactions`                            | Recurring/scheduled transaction definitions.                                                            |
| `reconciliations`                                   | Reconciliation session records.                                                                         |
| `goals`                                             | Category goal definitions and target information.                                                       |
| `domain_events`                                     | Audit/event history foundation.                                                                         |
| `undo_records`                                      | Earlier undo-preview records.                                                                           |
| `command_history`                                   | Executable undo/redo command records.                                                                   |
| `import_runs`                                       | YNAB/bank import batch metadata.                                                                        |
| `import_maps`                                       | Mapping between imported source entities and internal IDs.                                              |
| `bank_import_batches`                               | Bank import batch/commit metadata.                                                                      |
| `bank_import_batch_items`                           | Bank-imported transaction candidate rows.                                                               |
| `file_fingerprints`                                 | File/import fingerprint data used for duplicate prevention.                                             |
| `deleted_items`                                     | Tombstones for deletes/sync/import rollback tracking.                                                   |
| `backup_records`                                    | Backup metadata.                                                                                        |
| `backup_versions`                                   | Backup version tracking and retention.                                                                  |
| `users`                                             | Local/future-user records.                                                                              |
| `budget_users`                                      | User access to budgets.                                                                                 |
| `sessions`                                          | Session records.                                                                                        |
| `user_settings`                                     | User-level UI/local settings.                                                                           |
| `user_keys`, `budget_keys`, `encrypted_budget_keys` | Encryption/key metadata.                                                                                |
| `encrypted_records`                                 | Generic encrypted record support.                                                                       |
| `devices`                                           | Device identities for future sync/multi-device workflows.                                               |
| `device_settings`                                   | Device-specific settings.                                                                               |
| `change_records`                                    | Change tracking for sync/audit.                                                                         |
| `sync_states`                                       | Sync state by device/provider.                                                                          |
| `cloud_storage_settings`                            | File-sync/provider configuration.                                                                       |
| `app_settings`                                      | Application-level settings.                                                                             |
| `recent_files`                                      | Recent budget package registry.                                                                         |
| `schema_migrations`                                 | Migration execution records.                                                                            |

## Indexing

v1.2.12 added performance/search indexing for common UI filters. Important access paths include:

- Transaction filtering by budget/account/category/payee/status/date/amount.
- Search and matching workflows.
- Import batch lookup.
- Command history lookup.
- Payee-rule and bank-import workflows.

## Application-level guard examples

Some rules are intentionally enforced in services because they require domain context:

- Do not delete an account that still has transactions or scheduled transactions.
- Do not casually edit/delete reconciled transactions.
- Merge categories by moving transactions, category-month data, and goals first.
- Prevent unsafe restore paths and unsafe attachment paths.
- Treat import rollback as a workflow, not a raw cascade delete.

## Future schema hardening

The remaining database-layer improvement is a careful migration toward more real foreign keys and `ON DELETE`/`ON UPDATE` behaviour. This should be done after real imported data has been tested, because old YNAB4 budgets may contain edge cases that need compatibility handling.
