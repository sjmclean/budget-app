import type { CommittedCommandHandlerResult } from "./commandContext";

export interface LocalBudgetDomainCommandHandler<T> {
  execute(): Promise<CommittedCommandHandlerResult<T>>;
}
