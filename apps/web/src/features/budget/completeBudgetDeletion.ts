import type { BudgetLifecycleResult } from "./budgetLifecycle";
import type { BudgetPersistenceProvider } from "../persistence/budgetPersistenceProvider";

/**
 * Deletes authoritative local-first state before removing the launcher entry.
 * The local-first client's delete operation owns remote lifecycle and OPFS cleanup.
 */
export async function completeBudgetDeletion(
  provider: BudgetPersistenceProvider,
  budgetId: string,
  removeRegistryEntry: () => BudgetLifecycleResult,
): Promise<BudgetLifecycleResult> {
  if (provider.syncArchitecture === "local-first-relay") {
    if (!provider.accountRegisterQueries) {
      throw new Error("Local-first budget deletion is unavailable.");
    }
    await provider.accountRegisterQueries.deleteBudget(budgetId);
  }
  return removeRegistryEntry();
}
