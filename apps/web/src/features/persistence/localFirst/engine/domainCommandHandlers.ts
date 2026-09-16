import type { CommittedCommandHandlerResult, LocalBudgetCommandContext } from "./commandContext";

export interface LocalBudgetDomainCommandHandler<T> {
  execute(): Promise<CommittedCommandHandlerResult<T>>;
}

/** Builds the explicit committed-result boundary shared by all typed domain
 * families. The supplied operation is the family's strongly typed worker
 * orchestration and is complete before committed metadata is returned. */
export function createDomainCommandHandler<T>(input: {
  readonly budgetId: string;
  readonly context: LocalBudgetCommandContext;
  readonly operation: () => Promise<T>;
}): LocalBudgetDomainCommandHandler<T> {
  return {
    async execute() {
      input.context.begin(input.budgetId);
      try {
        const result = await input.operation();
        return input.context.committed(result);
      } catch (error) {
        input.context.abort();
        throw error;
      }
    },
  };
}
