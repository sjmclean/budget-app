import { subscribeToLocalFirstMutationCommits } from "../persistence/localFirst/mutationEvents";
import { restorePointCoordinator } from "./restorePointCoordinator";
import type { RestorePointMetadata } from "./restorePointTypes";

let stop: (() => void) | null = null;

export function startRestorePointLifecycle(input: {
  activeBudgetId(): string | null;
  capture(budgetId: string, mutations: number): Promise<RestorePointMetadata | null>;
  onError(error: unknown): void;
}): () => void {
  // Bootstrap/HMR can call this repeatedly; the successful mutation signal has
  // exactly one subscriber and callbacks never operate outside the query lease.
  stop?.();
  const unsubscribe = subscribeToLocalFirstMutationCommits(restorePointCoordinator.mutation);
  const reevaluate = () => {
    if (document.visibilityState === "hidden") return;
    void restorePointCoordinator.reevaluate(input.activeBudgetId(), input.capture).catch(input.onError);
  };
  const heartbeat = setInterval(reevaluate, 30_000);
  window.addEventListener("focus", reevaluate);
  document.addEventListener("visibilitychange", reevaluate);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearInterval(heartbeat);
    unsubscribe();
    window.removeEventListener("focus", reevaluate);
    document.removeEventListener("visibilitychange", reevaluate);
    if (stop === dispose) stop = null;
  };
  stop = dispose;
  return dispose;
}
