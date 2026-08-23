import type { BudgetLifecycleResult } from "./budgetLifecycle";
import type { BudgetPersistenceProvider } from "../persistence/budgetPersistenceProvider";
import {
  clearBudgetDeletionMarker,
  markBudgetDeletionInProgress,
} from "./budgetDeletionMarkers";
import { applicationHistory } from "../history/applicationHistory";

export function shouldRestoreBudgetSelectionAfterDeletionFailure(error: unknown): boolean {
  return !Boolean(
    error && typeof error === "object" &&
    "authoritativeDeletionCompleted" in error &&
    error.authoritativeDeletionCompleted === true,
  );
}

/**
 * Deletes authoritative local-first state before removing the launcher entry.
 * The local-first client's delete operation owns remote lifecycle and OPFS cleanup.
 */
export async function completeBudgetDeletion(
  provider: BudgetPersistenceProvider,
  budgetId: string,
  removeRegistryEntry: () => BudgetLifecycleResult,
): Promise<BudgetLifecycleResult> {
  const storage = provider.keyValueStorage;
  let authoritativeDeletionCompleted = provider.syncArchitecture !== "local-first-relay";
  if (storage) {
    markBudgetDeletionInProgress(storage, budgetId);
    await provider.flush?.();
  }

  try {
    if (provider.syncArchitecture === "local-first-relay") {
      if (!provider.accountRegisterQueries) {
        throw new Error("Local-first budget deletion is unavailable.");
      }
      await provider.accountRegisterQueries.deleteBudget(budgetId);
      authoritativeDeletionCompleted = true;
    }
    const result = removeRegistryEntry();
    if (result.completed) applicationHistory.destroy(budgetId);
    if (result.completed && storage) {
      clearBudgetDeletionMarker(storage, budgetId);
      await provider.flush?.();
    }
    return result;
  } catch (error) {
    const crossedBoundary = authoritativeDeletionCompleted || Boolean(
      error && typeof error === "object" &&
      "authoritativeDeletionCompleted" in error &&
      error.authoritativeDeletionCompleted === true,
    );
    if (crossedBoundary) {
      if (error && typeof error === "object") {
        Object.assign(error, { authoritativeDeletionCompleted: true });
      }
      throw error;
    }
    if (storage) {
      clearBudgetDeletionMarker(storage, budgetId);
      await provider.flush?.();
    }
    throw error;
  }
}
