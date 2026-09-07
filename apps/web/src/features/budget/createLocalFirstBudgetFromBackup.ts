import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import {
  createBudgetRegistryEntry,
  deleteBudgetRegistryEntry,
  type BudgetSummary,
} from "./budgetRegistry";
import { cloneBudgetBackup } from "./backupClone";
import { LocalBudgetDatabaseClient } from "../persistence/localFirst/localBudgetClient";
import { getOrCreateLocalFirstDeviceId } from "../persistence/localFirst/localFirstDeviceId";
import { provisionFreshLocalFirstBudget } from "../persistence/localFirst/freshBudgetProvisioning";
import {
  LOCAL_FIRST_BASELINE_CHUNK_BYTES,
} from "../persistence/localFirst/relayTransport";
import { publishLocalBaseline } from "../persistence/localFirst/baselineCoordinator";

export interface CreateLocalFirstBudgetFromBackupInput {
  readonly name: string;
  readonly file: File;
}

/**
 * Creates a new logical budget from an exported SQLite backup.
 *
 * The source backup is first cloned in memory and re-keyed to a fresh budget
 * ID and sync epoch. Existing budgets and their local generations are never
 * opened or replaced by this workflow.
 */
export async function createLocalFirstBudgetFromBackup(
  storage: KeyValueStoragePort,
  input: CreateLocalFirstBudgetFromBackupInput,
  now = new Date(),
): Promise<BudgetSummary> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter a name for the restored budget.");

  const budget = createBudgetRegistryEntry(storage, { name, now });
  let provisioned:
    | Awaited<ReturnType<typeof provisionFreshLocalFirstBudget>>
    | null = null;
  let database: LocalBudgetDatabaseClient | null = null;
  let replacementStarted = false;
  let replacementCommitted = false;

  try {
    provisioned = await provisionFreshLocalFirstBudget(budget.id);
    const deviceId = getOrCreateLocalFirstDeviceId(storage);
    const cloned = await cloneBudgetBackup({
      file: input.file,
      targetBudgetId: budget.id,
      targetSyncEpoch: provisioned.syncEpoch,
      deviceId,
    });

    database = new LocalBudgetDatabaseClient(undefined, storage);
    await database.beginBaselineReplacement({
      budgetId: budget.id,
      syncEpoch: provisioned.syncEpoch,
      deviceId,
      totalBytes: cloned.bytes.byteLength,
    });
    replacementStarted = true;

    let offset = 0;
    while (offset < cloned.bytes.byteLength) {
      const chunk = cloned.bytes.subarray(
        offset,
        Math.min(offset + LOCAL_FIRST_BASELINE_CHUNK_BYTES, cloned.bytes.byteLength),
      );
      await database.appendBaselineReplacement(offset, chunk);
      offset += chunk.byteLength;
    }

    await database.commitBaselineReplacement();
    replacementCommitted = true;
    replacementStarted = false;

    await publishLocalBaseline({
      budgetId: budget.id,
      budgetName: budget.name,
      currency: budget.currency,
      syncEpoch: provisioned.syncEpoch,
      database,
      relay: provisioned.relay,
    });

    await database.close();
    database = null;
    return budget;
  } catch (error) {
    let cleanupError: unknown;

    if (database) {
      if (replacementStarted) {
        await database.abortBaselineReplacement().catch(() => undefined);
      }
      if (replacementCommitted) {
        await database.deleteBudgetFile().catch((failure) => {
          cleanupError ??= failure;
        });
      }
      await database.close().catch((failure) => {
        cleanupError ??= failure;
      });
    }

    if (provisioned) {
      await provisioned.relay.deleteBudget(budget.id).catch((failure) => {
        cleanupError ??= failure;
      });
    }

    deleteBudgetRegistryEntry(storage, budget.id);
    throw cleanupError ?? error;
  }
}
