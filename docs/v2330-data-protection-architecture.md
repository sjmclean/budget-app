# v2.33.0 Data Protection Architecture

Status: foundation release

## Purpose

This release introduces the first internal architecture for Budget App Version History. It is not an undo/redo system and it is not external backup/export. It is a budget-owned rolling history of restorable snapshots.

## Product decisions

- Version History belongs to the current budget.
- Snapshots are internal application data, not user-managed files.
- Manual restore points are normal snapshots with an optional description.
- Manual and automatic snapshots share one retention policy.
- The default retention target is 30 snapshots.
- Older snapshots are pruned oldest-first when the retention limit is exceeded.
- External backups remain a separate future workflow for migration, archiving, and disaster recovery.
- Undo/redo remains a separate future subsystem for immediate action-level correction.

## Foundation components

`apps/web/src/features/budget/versionHistory.ts` provides:

- `createVersionHistorySnapshot`
- `listVersionHistorySnapshots`
- `readVersionHistorySnapshotPackage`
- `restoreVersionHistorySnapshot`
- `deleteVersionHistorySnapshot`
- `collectVersionHistoryStorageKeys`

Snapshots use the existing budget backup package internally so the first implementation reuses proven active-budget export/restore behaviour instead of inventing a second budget serialisation format.

## Storage model

The history index and snapshot payloads are stored under the budget-scoped key namespace:

```text
budget-app.budgets.<budgetId>.budget-app.version-history-index.v1
budget-app.budgets.<budgetId>.budget-app.version-history-snapshot.v1.<snapshotId>
```

This keeps history isolated per budget and prevents one budget's snapshots from being exported or restored into another budget accidentally.

## Testing

`tests/v2330-data-protection-architecture.ts` covers:

- automatic snapshot creation
- described/manual snapshot creation
- rolling retention
- pruning payloads when metadata is pruned
- restoring a snapshot into the active budget
- preserving other budgets during restore
- deleting snapshots
- verifying history keys are budget-scoped
