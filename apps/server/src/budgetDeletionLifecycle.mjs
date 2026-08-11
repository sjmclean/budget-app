/**
 * Removes every authoritative server-side representation of one budget.
 * Store-specific cleanup remains responsible for reference-safe blob removal.
 */
export function createBudgetDeletionLifecycle({
  localFirstRelayStore,
  replicationStore,
  authStore,
}) {
  return {
    deleteBudget(budgetId) {
      const localFirst = localFirstRelayStore.deleteBudget(budgetId);
      const replication = replicationStore.deleteBudget(budgetId);
      const membership = authStore.deleteBudgetMemberships(budgetId);
      return {
        budgetId,
        deleted: true,
        ...localFirst,
        ...replication,
        ...membership,
      };
    },
  };
}
