import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import type { AccountRegisterMutationDelta } from "../../accountRegisterMutationDelta";
import type { LocalBudgetMutation } from "../contracts";

export interface CommittedCommandHandlerResult<T> {
  readonly result: T;
  readonly mutationIds: readonly string[];
  readonly change: PersistenceChangeScope;
  readonly registerDelta?: AccountRegisterMutationDelta;
}

export type CommittedCommandMethods<Commands> = {
  readonly [Key in keyof Commands]-?: NonNullable<Commands[Key]> extends (...args: infer Arguments) => Promise<infer Result>
    ? (...args: Arguments) => Promise<CommittedCommandHandlerResult<Result>>
    : never;
};

export function committedCommandResult<T>(result: T, mutations: readonly LocalBudgetMutation[],
  change: PersistenceChangeScope, registerDelta?: AccountRegisterMutationDelta): CommittedCommandHandlerResult<T> {
  return { result, mutationIds: mutations.map(({ mutationId }) => mutationId), change, registerDelta };
}

export function emptyCommandChange(budgetId: string): PersistenceChangeScope {
  return { budgetId, domains: [] };
}
