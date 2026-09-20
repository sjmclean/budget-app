import {
  acquireLocalFirstDatabaseTabOwnership,
  hasAnyLocalFirstDatabaseTabOwnership,
  hasLocalFirstDatabaseTabOwnership,
  LOCAL_FIRST_EXCLUSIVE_DATABASE_LEASE_SCOPE,
  releaseLocalFirstDatabaseTabOwnership,
} from "./localFirst/databaseTabCoordinator";
import { publishBroadBudgetChange } from "./persistenceChangeBus";
import { getReplicationBackgroundService } from "./replicationService";
import { getBudgetPersistenceProvider } from "./budgetPersistenceProviderFactory";
import { SELECTED_BUDGET_STORAGE_KEY } from "../budget/budgetDataScope";

/** Route loaders and Switch Budget await this before making the launcher ready. */
export async function releaseActiveBudgetPersistence(): Promise<void> {
  const queries = getBudgetPersistenceProvider().accountRegisterQueries;
  const hadPhysicalLease = hasAnyLocalFirstDatabaseTabOwnership();
  await releaseLocalFirstDatabaseTabOwnership();
  if (!hadPhysicalLease) {
    await queries?.releaseLocalDatabase?.();
  }
}

export async function activateBudgetPersistence(budgetId: string): Promise<void> {
  const queries = getBudgetPersistenceProvider().accountRegisterQueries;
  if (!queries?.activateLocalBudget) return;

  const wasReleased = queries.isLocalDatabaseReleased?.() ?? false;
  await acquireLocalFirstDatabaseTabOwnership(
    budgetId,
    async () => {
      await queries.releaseLocalDatabase?.();
    },
  );
  if (!hasLocalFirstDatabaseTabOwnership(budgetId)) return;

  try {
    await queries.activateLocalBudget(budgetId);
  } catch (error) {
    await releaseLocalFirstDatabaseTabOwnership().catch(() => undefined);
    throw error;
  }

  if (!hasLocalFirstDatabaseTabOwnership(budgetId)) {
    await queries.releaseLocalDatabase?.().catch(() => undefined);
    throw Object.assign(
      new Error("The active budget lost physical SQLite ownership during activation."),
      { code: "BUDGET_DATABASE_RELEASED" },
    );
  }

  if (wasReleased) {
    publishBroadBudgetChange({
      budgetId,
      source: "replication",
    });
  }

  void getReplicationBackgroundService()?.syncNow().catch((error: unknown) => {
    console.error("Unable to synchronise the active budget after local activation.", error);
  });
}

/** Shared boundary for independent staged-import clients (blank, YNAB4, Actual). */
export async function runWithExclusiveBudgetDatabase<T>(operation: () => Promise<T>): Promise<T> {
  const provider = getBudgetPersistenceProvider();
  const queries = provider.accountRegisterQueries;
  const budgetId = provider.keyValueStorage?.getItem(SELECTED_BUDGET_STORAGE_KEY);
  const leaseScope = budgetId ?? LOCAL_FIRST_EXCLUSIVE_DATABASE_LEASE_SCOPE;

  await acquireLocalFirstDatabaseTabOwnership(
    leaseScope,
    async () => {
      await queries?.releaseLocalDatabase?.();
    },
  );

  if (!hasLocalFirstDatabaseTabOwnership(leaseScope)) {
    throw new Error("The exclusive local database lease was cancelled before acquisition.");
  }

  try {
    if (budgetId && !queries?.isLocalDatabaseReleased?.()) {
      await queries?.createRestorePoint?.(budgetId, "before-import");
    }
    if (queries?.runWithExclusiveLocalDatabase) {
      return await queries.runWithExclusiveLocalDatabase(operation);
    }
    await queries?.releaseLocalDatabase?.();
    return await operation();
  } finally {
    await releaseLocalFirstDatabaseTabOwnership();
  }
}
