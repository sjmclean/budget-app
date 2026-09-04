import { RESTORE_POINT_INTERVAL_MS } from "./restorePointRetention";
import type { RestorePointMetadata } from "./restorePointTypes";

interface BudgetCheckpointState {
  mutations: number;
  checkpointMutations: number;
  dueAt: number;
  pending: Promise<void> | null;
}

/** Scheduling only: captures are admitted by the existing SQLite ownership queue. */
export function createRestorePointCoordinator(now: () => number = Date.now) {
  const states = new Map<string, BudgetCheckpointState>();
  function mutation(budgetId: string) {
    const state = states.get(budgetId) ?? {
      mutations: 0, checkpointMutations: 0,
      dueAt: now() + RESTORE_POINT_INTERVAL_MS, pending: null,
    };
    if (state.mutations === state.checkpointMutations) {
      state.dueAt = now() + RESTORE_POINT_INTERVAL_MS;
    }
    state.mutations += 1;
    states.set(budgetId, state);
  }
  function count(budgetId: string) {
    const state = states.get(budgetId);
    return state ? state.mutations - state.checkpointMutations : 0;
  }
  function version(budgetId: string) { return states.get(budgetId)?.mutations ?? 0; }
  function checkpoint(budgetId: string, capturedVersion: number) {
    const state = states.get(budgetId);
    if (!state) return;
    state.checkpointMutations = Math.max(state.checkpointMutations, Math.min(state.mutations, capturedVersion));
    state.dueAt = now() + RESTORE_POINT_INTERVAL_MS;
  }
  async function reevaluate(
    budgetId: string | null,
    capture: (budgetId: string, mutations: number) => Promise<RestorePointMetadata | null>,
  ): Promise<void> {
    if (!budgetId) return;
    const state = states.get(budgetId);
    if (!state || count(budgetId) === 0 || now() < state.dueAt) return;
    if (state.pending) return state.pending;
    const capturedMutations = count(budgetId);
    const capturedVersion = version(budgetId);
    state.pending = (async () => {
      const point = await capture(budgetId, capturedMutations);
      if (point) checkpoint(budgetId, capturedVersion);
    })().finally(() => { state.pending = null; });
    return state.pending;
  }
  return { mutation, count, version, checkpoint, reevaluate };
}

export const restorePointCoordinator = createRestorePointCoordinator();
