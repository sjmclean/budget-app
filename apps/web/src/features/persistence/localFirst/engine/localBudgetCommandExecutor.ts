import type { LocalBudgetCommandResult } from "../../accountRegisterQueryContracts";
import { notifyLocalFirstMutationCommitted } from "../mutationEvents";
import type { LocalBudgetDomainCommandHandler } from "./domainCommandHandlers";

export class LocalBudgetCommandExecutor {
  #tail: Promise<void> = Promise.resolve();

  async execute<T>(commandId: string, handler: LocalBudgetDomainCommandHandler<T>): Promise<LocalBudgetCommandResult<T>> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const { result, mutationIds, change } = await handler.execute();
      if (change.domains.length > 0) {
        notifyLocalFirstMutationCommitted(change.budgetId, change);
      }
      return { commandId, result, mutationIds, change };
    } finally {
      release();
    }
  }
}
