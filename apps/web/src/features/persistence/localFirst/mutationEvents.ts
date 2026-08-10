export const LOCAL_FIRST_MUTATION_COMMITTED_EVENT =
  "budget-app:local-first-mutation-committed";

export interface LocalFirstMutationCommittedDetail {
  readonly budgetId: string;
}

export function notifyLocalFirstMutationCommitted(budgetId: string): void {
  if (!budgetId || typeof globalThis.CustomEvent !== "function") return;
  globalThis.dispatchEvent?.(
    new CustomEvent<LocalFirstMutationCommittedDetail>(
      LOCAL_FIRST_MUTATION_COMMITTED_EVENT,
      { detail: { budgetId } },
    ),
  );
}

export function subscribeToLocalFirstMutationCommits(
  listener: (budgetId: string) => void,
): () => void {
  const handler = (event: Event) => {
    const budgetId = (event as CustomEvent<LocalFirstMutationCommittedDetail>)
      .detail?.budgetId;
    if (budgetId) listener(budgetId);
  };
  globalThis.addEventListener?.(LOCAL_FIRST_MUTATION_COMMITTED_EVENT, handler);
  return () =>
    globalThis.removeEventListener?.(
      LOCAL_FIRST_MUTATION_COMMITTED_EVENT,
      handler,
    );
}
