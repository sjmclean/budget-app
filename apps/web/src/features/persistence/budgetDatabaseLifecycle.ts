import { getBudgetPersistenceProvider } from "./budgetPersistenceProviderFactory";

/** Route loaders and Switch Budget await this before making the launcher ready. */
export async function releaseActiveBudgetPersistence(): Promise<void> {
  await getBudgetPersistenceProvider().accountRegisterQueries?.releaseLocalDatabase?.();
}

export async function activateBudgetPersistence(budgetId: string): Promise<void> {
  await getBudgetPersistenceProvider().accountRegisterQueries?.activateLocalBudget?.(budgetId);
}

/** Shared boundary for independent staged-import clients (blank, YNAB4, Actual). */
export async function runWithExclusiveBudgetDatabase<T>(operation: () => Promise<T>): Promise<T> {
  const queries = getBudgetPersistenceProvider().accountRegisterQueries;
  if (queries?.runWithExclusiveLocalDatabase) return queries.runWithExclusiveLocalDatabase(operation);
  await queries?.releaseLocalDatabase?.();
  return operation();
}
