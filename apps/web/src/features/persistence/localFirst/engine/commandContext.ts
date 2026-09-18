import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import type { LocalBudgetMutation } from "../contracts";

export interface CommittedCommandHandlerResult<T> {
  readonly result: T;
  readonly mutationIds: readonly string[];
  readonly change: PersistenceChangeScope;
}

export type CommittedCommandMethods<Commands> = {
  readonly [Key in keyof Commands]-?: NonNullable<Commands[Key]> extends (...args: infer Arguments) => Promise<infer Result>
    ? (...args: Arguments) => Promise<CommittedCommandHandlerResult<Result>>
    : never;
};

export function committedCommandResult<T>(result: T, mutations: readonly LocalBudgetMutation[],
  change: PersistenceChangeScope): CommittedCommandHandlerResult<T> {
  return { result, mutationIds: mutations.map(({ mutationId }) => mutationId), change };
}

export function emptyCommandChange(budgetId: string): PersistenceChangeScope {
  return { budgetId, domains: [] };
}
