import { getBudgetPersistenceProvider } from "./budgetPersistenceProviderFactory";
import { SELECTED_BUDGET_STORAGE_KEY } from "../budget/budgetDataScope";

/** Route loaders and Switch Budget await this before making the launcher ready. */
export async function releaseActiveBudgetPersistence(): Promise<void> {
  await getBudgetPersistenceProvider().accountRegisterQueries?.releaseLocalDatabase?.();
}

export async function activateBudgetPersistence(budgetId: string): Promise<void> {
  await getBudgetPersistenceProvider().accountRegisterQueries?.activateLocalBudget?.(budgetId);
}

/** Shared boundary for independent staged-import clients (blank, YNAB4, Actual). */
export async function runWithExclusiveBudgetDatabase<T>(operation: () => Promise<T>): Promise<T> {
  const provider = getBudgetPersistenceProvider();
  const queries = provider.accountRegisterQueries;
  const budgetId = provider.keyValueStorage?.getItem(SELECTED_BUDGET_STORAGE_KEY);
  if (budgetId && !queries?.isLocalDatabaseReleased?.()) {
    await queries?.createRestorePoint?.(budgetId, "before-import");
  }
  if (queries?.runWithExclusiveLocalDatabase) return queries.runWithExclusiveLocalDatabase(operation);
  await queries?.releaseLocalDatabase?.();
  return operation();
}
