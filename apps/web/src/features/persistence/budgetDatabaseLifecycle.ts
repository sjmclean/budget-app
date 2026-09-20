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
import { databaseReleasedError } from "./localFirst/budgetDatabaseOwnership";

let intendedActiveBudgetId: string | null = null;
let activationInFlight: { budgetId: string; promise: Promise<void> } | null = null;
let exclusiveOperationInFlight = false;

/** Route loaders and Switch Budget await this before making the launcher ready. */
export async function releaseActiveBudgetPersistence(
  options: { readonly preserveActiveIntent?: boolean } = {},
): Promise<void> {
  if (!options.preserveActiveIntent) intendedActiveBudgetId = null;

  const provider = getBudgetPersistenceProvider();
  const queries = provider.accountRegisterQueries;

  if (provider.syncArchitecture !== "local-first-relay") {
    await queries?.releaseLocalDatabase?.();
    return;
  }

  const hadPhysicalLease = hasAnyLocalFirstDatabaseTabOwnership();
  await releaseLocalFirstDatabaseTabOwnership();
  if (!hadPhysicalLease) {
    await queries?.releaseLocalDatabase?.();
  }
}

async function activateBudgetPersistenceCore(budgetId: string): Promise<void> {
  const provider = getBudgetPersistenceProvider();
  const queries = provider.accountRegisterQueries;
  if (!queries?.activateLocalBudget) return;

  if (provider.syncArchitecture !== "local-first-relay") {
    await queries.activateLocalBudget(budgetId);
    return;
  }

  const wasReleased = queries.isLocalDatabaseReleased?.() ?? false;
  await acquireLocalFirstDatabaseTabOwnership(
    budgetId,
    async () => {
      await queries.releaseLocalDatabase?.();
    },
  );

  if (intendedActiveBudgetId !== budgetId) {
    await releaseLocalFirstDatabaseTabOwnership().catch(() => undefined);
    return;
  }
  if (!hasLocalFirstDatabaseTabOwnership(budgetId)) return;

  try {
    await queries.activateLocalBudget(budgetId);
  } catch (error) {
    await releaseLocalFirstDatabaseTabOwnership().catch(() => undefined);
    throw error;
  }

  if (
    intendedActiveBudgetId !== budgetId ||
    !hasLocalFirstDatabaseTabOwnership(budgetId)
  ) {
    await queries.releaseLocalDatabase?.().catch(() => undefined);
    if (intendedActiveBudgetId === budgetId) {
      throw Object.assign(
        new Error("The active budget lost physical SQLite ownership during activation."),
        { code: "BUDGET_DATABASE_RELEASED" },
      );
    }
    return;
  }

  if (wasReleased) {
    publishBroadBudgetChange({
      budgetId,
      source: "replication",
    });
  }
}

export async function activateBudgetPersistence(
  budgetId: string,
  options: { readonly deferBackgroundSync?: boolean } = {},
): Promise<void> {
  intendedActiveBudgetId = budgetId;

  let operation = activationInFlight?.budgetId === budgetId
    ? activationInFlight.promise
    : null;
  if (!operation) {
    operation = (async () => {
      if (activationInFlight && activationInFlight.budgetId !== budgetId) {
        await activationInFlight.promise.catch(() => undefined);
      }
      await activateBudgetPersistenceCore(budgetId);
    })();
    activationInFlight = { budgetId, promise: operation };
    void operation.finally(() => {
      if (activationInFlight?.promise === operation) activationInFlight = null;
    }).catch(() => undefined);
  }

  await operation;
  if (!options.deferBackgroundSync && intendedActiveBudgetId === budgetId) {
    nudgeActiveBudgetReplication();
  }
}

export async function ensureActiveBudgetPersistenceReady(
  budgetId: string,
): Promise<void> {
  const provider = getBudgetPersistenceProvider();
  const queries = provider.accountRegisterQueries;
  if (provider.syncArchitecture !== "local-first-relay") return;
  if (
    exclusiveOperationInFlight ||
    intendedActiveBudgetId !== budgetId ||
    (typeof document !== "undefined" && document.visibilityState === "hidden")
  ) {
    throw databaseReleasedError();
  }
  if (
    hasLocalFirstDatabaseTabOwnership(budgetId) &&
    !queries?.isLocalDatabaseReleased?.()
  ) {
    return;
  }
  await activateBudgetPersistence(budgetId);
  if (
    intendedActiveBudgetId !== budgetId ||
    !hasLocalFirstDatabaseTabOwnership(budgetId) ||
    queries?.isLocalDatabaseReleased?.()
  ) {
    throw databaseReleasedError();
  }
}

export function nudgeActiveBudgetReplication(): void {
  void getReplicationBackgroundService()?.syncNow().catch((error: unknown) => {
    console.error("Unable to synchronise the active budget after local activation.", error);
  });
}

/** Shared boundary for independent staged-import clients (blank, YNAB4, Actual). */
export async function runWithExclusiveBudgetDatabase<T>(operation: () => Promise<T>): Promise<T> {
  const provider = getBudgetPersistenceProvider();
  const queries = provider.accountRegisterQueries;
  const budgetId = provider.keyValueStorage?.getItem(SELECTED_BUDGET_STORAGE_KEY);

  if (provider.syncArchitecture !== "local-first-relay") {
    if (budgetId && !queries?.isLocalDatabaseReleased?.()) {
      await queries?.createRestorePoint?.(budgetId, "before-import");
    }
    if (queries?.runWithExclusiveLocalDatabase) {
      return queries.runWithExclusiveLocalDatabase(operation);
    }
    await queries?.releaseLocalDatabase?.();
    return operation();
  }

  if (
    budgetId &&
    hasLocalFirstDatabaseTabOwnership(budgetId) &&
    !queries?.isLocalDatabaseReleased?.()
  ) {
    await queries?.createRestorePoint?.(budgetId, "before-import");
  }

  await acquireLocalFirstDatabaseTabOwnership(
    LOCAL_FIRST_EXCLUSIVE_DATABASE_LEASE_SCOPE,
    async () => {
      await queries?.releaseLocalDatabase?.();
    },
  );

  if (!hasLocalFirstDatabaseTabOwnership(LOCAL_FIRST_EXCLUSIVE_DATABASE_LEASE_SCOPE)) {
    throw new Error("The exclusive local database lease was cancelled before acquisition.");
  }

  exclusiveOperationInFlight = true;
  try {
    if (queries?.runWithExclusiveLocalDatabase) {
      return await queries.runWithExclusiveLocalDatabase(operation);
    }
    await queries?.releaseLocalDatabase?.();
    return await operation();
  } finally {
    exclusiveOperationInFlight = false;
    await releaseLocalFirstDatabaseTabOwnership();
  }
}
