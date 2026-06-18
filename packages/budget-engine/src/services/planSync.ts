import { ChangeRecord } from "../../../types/src/ChangeRecord.js";
import { SyncPlan } from "../../../types/src/SyncPlan.js";

export function planSync(
  localChanges: ChangeRecord[],
  remoteChanges: ChangeRecord[]
): SyncPlan {
  const localHashes = new Set(localChanges.map((change) => change.changeHash));
  const remoteHashes = new Set(remoteChanges.map((change) => change.changeHash));

  const localOnly = localChanges.filter((change) => !remoteHashes.has(change.changeHash));
  const remoteOnly = remoteChanges.filter((change) => !localHashes.has(change.changeHash));

  const entityConflicts = localOnly.filter((local) =>
    remoteOnly.some((remote) =>
      remote.entityType === local.entityType &&
      remote.entityId === local.entityId &&
      remote.operation !== local.operation
    )
  );

  return {
    canFastForward: localOnly.length === 0 || remoteOnly.length === 0,
    requiresMerge: localOnly.length > 0 && remoteOnly.length > 0,
    conflictCount: entityConflicts.length,
    notes: [
      `Local-only changes: ${localOnly.length}`,
      `Remote-only changes: ${remoteOnly.length}`,
      `Entity conflicts: ${entityConflicts.length}`
    ]
  };
}
