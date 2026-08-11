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
    hasAuthoritativeState(budgetId) {
      return localFirstRelayStore.hasBudgetState(budgetId) ||
        replicationStore.hasBudgetState(budgetId) ||
        authStore.hasBudgetMemberships(budgetId);
    },
    deleteBudgetForUser(user, budgetId) {
      if (!this.hasAuthoritativeState(budgetId)) {
        return { budgetId, deleted: true, alreadyAbsent: true };
      }
      authStore.requireBudgetRole(user, budgetId, "owner");
      return this.deleteBudget(budgetId);
    },
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
