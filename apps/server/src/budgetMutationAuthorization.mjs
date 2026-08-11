/**
 * Revalidates access at the authoritative write boundary. Call this after any
 * awaited body/file read so a completed deletion cannot be crossed by a stale
 * request that was authorized earlier.
 */
export function performAuthorizedBudgetMutation(
  authStore,
  user,
  budgetId,
  minimumRole,
  mutation,
) {
  authStore.requireBudgetRole(user, budgetId, minimumRole);
  return mutation();
}
