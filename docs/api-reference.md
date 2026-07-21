# Backend API Reference

This is a high-level developer reference for the backend service surface. It is not an HTTP API; the future UI should call these services directly or through a thin adapter.

## Budget/package services

- `BudgetApplicationService`
- `BudgetRegistryApplicationService`
- `BudgetPackageManager`
- `BudgetCreator`
- `BudgetOpener`
- `BackupApplicationService`
- `BackupManager`
- `RestoreManager`
- `AttachmentApplicationService`
- `AttachmentManager`

## Core budget services

- `TransactionApplicationService`
- `TransactionManagementApplicationService`
- `TransactionMetadataApplicationService`
- `BulkTransactionApplicationService`
- `AccountManagementApplicationService`
- `AccountSafetyApplicationService`
- `CategoryManagementApplicationService`
- `CategoryMergeApplicationService`
- `PayeeManagementApplicationService`
- `GoalApplicationService`
- `ReconciliationApplicationService`
- `ScheduledTransactionExecutionService`
- `ScheduledTransactionManagementApplicationService`

## Import and matching services

- YNAB4 package import is a launcher workflow; see `docs/ynab4-import.md`.
- `ImportReviewApplicationService`
- `ImportRollbackApplicationService`
- `BankImportApplicationService`
- `BankImportCommitApplicationService`
- `TransactionMatchingApplicationService`
- `AutoCategorizationApplicationService`
- `PayeeRuleApplicationService`
- `PersistentPayeeRuleApplicationService`

## Safety/history/search services

- `UndoRedoApplicationService`
- `CommandHistoryApplicationService`
- `AuditApplicationService`
- `DatabaseIntegrityApplicationService`
- `SearchApplicationService`
- `DbBackedSearchApplicationService`
- `IndexedTransactionSearchApplicationService`
- `SearchFilterApplicationService`
- `PerformanceIndexApplicationService`

## Settings/security/sync services

- `SettingsApplicationService`
- `UserSettingsApplicationService`
- `CloudStorageSettingsApplicationService`
- `EncryptionApplicationService`
- `AuthApplicationService`
- `SyncApplicationService`
- `DeviceApplicationService`
