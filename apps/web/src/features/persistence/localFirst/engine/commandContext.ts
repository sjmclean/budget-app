import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import { mergePersistenceChangeScopes } from "../persistenceChangeImpact";
import type { LocalBudgetMutationContext } from "./mutationContext";

export interface CommittedCommandHandlerResult<T> {
  readonly result: T;
  readonly mutationIds: readonly string[];
  readonly change: PersistenceChangeScope;
}

/** Per-command construction context. It allocates mutation metadata and turns
 * post-commit handler metadata into an explicit committed result. */
export class LocalBudgetCommandContext {
  readonly #mutations: LocalBudgetMutationContext;
  #budgetId: string | null = null;
  #changes: PersistenceChangeScope[] = [];

  constructor(mutations: LocalBudgetMutationContext) {
    this.#mutations = mutations;
  }

  begin(budgetId: string): void {
    if (this.#budgetId) throw new Error("A local budget command is already active.");
    this.#budgetId = budgetId;
    this.#changes = [];
    this.#mutations.beginCommand();
  }

  recordCommittedChange(budgetId: string, change: Omit<PersistenceChangeScope, "budgetId">): void {
    if (this.#budgetId !== budgetId) throw new Error("Command change metadata does not match the active budget.");
    this.#changes.push({ budgetId, ...change });
  }

  committed<T>(result: T): CommittedCommandHandlerResult<T> {
    if (!this.#budgetId) throw new Error("No local budget command is active.");
    const budgetId = this.#budgetId;
    const mutationIds = this.#mutations.commitCommand();
    const change = this.#changes.length > 0
      ? mergePersistenceChangeScopes(budgetId, ...this.#changes)
      : { budgetId, domains: [] } satisfies PersistenceChangeScope;
    this.#budgetId = null;
    this.#changes = [];
    return { result, mutationIds, change };
  }

  abort(): void {
    this.#budgetId = null;
    this.#changes = [];
    this.#mutations.abortCommand();
  }
}
