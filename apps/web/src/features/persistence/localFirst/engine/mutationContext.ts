import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import type { BudgetDomain, LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";

export interface LocalBudgetMutationContextOptions {
  readonly storage: Pick<Storage, "getItem" | "setItem">;
  readonly deviceId: string;
  readonly currentSyncEpoch: () => string | null;
  readonly currentBaseCursor: () => number;
}

/** Allocates the replication identity and grouping metadata used to construct
 * locally initiated mutations. It does not track command completion. */
export class LocalBudgetMutationContext {
  readonly #storage: Pick<Storage, "getItem" | "setItem">;
  readonly #deviceId: string;
  readonly #sequenceKey: string;
  readonly #currentSyncEpoch: () => string | null;
  readonly #currentBaseCursor: () => number;
  #deviceSequence: number;

  constructor(options: LocalBudgetMutationContextOptions) {
    this.#storage = options.storage;
    this.#deviceId = options.deviceId;
    this.#sequenceKey = `budget-app.local-first.device-sequence.${options.deviceId}`;
    this.#currentSyncEpoch = options.currentSyncEpoch;
    this.#currentBaseCursor = options.currentBaseCursor;
    this.#deviceSequence = Number(options.storage.getItem(this.#sequenceKey) ?? "0");
    if (!Number.isSafeInteger(this.#deviceSequence) || this.#deviceSequence < 0) {
      this.#deviceSequence = 0;
    }
  }

  createMutation(
    budgetId: string,
    domain: BudgetDomain,
    entityId: string,
    operation: "upsert" | "delete",
    payload: unknown,
    operationGroupId?: string,
    operationGroup?: LocalBudgetOperationGroup,
  ): LocalBudgetMutation {
    const syncEpoch = this.#currentSyncEpoch();
    if (!syncEpoch) throw new Error("A local command requires an active sync epoch.");
    this.#deviceSequence += 1;
    this.#storage.setItem(this.#sequenceKey, String(this.#deviceSequence));
    const mutationId = createRuntimeUuid();
    return {
      mutationId,
      ...(operationGroupId ? { operationGroupId } : {}),
      ...(operationGroup ? { operationGroup } : {}),
      budgetId,
      syncEpoch,
      deviceId: this.#deviceId,
      deviceSequence: this.#deviceSequence,
      baseCursor: this.#currentBaseCursor(),
      domain,
      entityId,
      operation,
      payload,
      createdAt: new Date().toISOString(),
    };
  }

}
