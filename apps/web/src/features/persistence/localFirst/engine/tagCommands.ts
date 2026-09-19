import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import type { TransactionTagDefinition } from "../../../tags/transactionTagTypes";
import type { LocalBudgetMutation } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { persistenceScopeForMutations } from "../mutationEvents";
import { committedCommandResult, emptyCommandChange, type CommittedCommandMethods } from "./commandContext";

type TagCommands = Pick<
  LocalBudgetRuntimeClient,
  "listTransactionTags" | "replaceTransactionTags" | "replaceTransactionTagsHistoryState"
>;
type TagWriteCommands = Pick<TagCommands, "replaceTransactionTags" | "replaceTransactionTagsHistoryState">;

export interface TagCommandDependencies {
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: (budgetId: string, domain: LocalBudgetMutation["domain"], entityId: string,
    operation: LocalBudgetMutation["operation"], payload: unknown) => LocalBudgetMutation;
}

/** Owns ordinary tag writes. Current state is read directly from local SQLite. */
export function createTagCommands(dependencies: TagCommandDependencies):
  CommittedCommandMethods<TagWriteCommands> {
  const listLocalTags = (local: LocalBudgetDatabaseClient) =>
    local.listEntities<TransactionTagDefinition>("transactionTags");
  const commands: CommittedCommandMethods<TagWriteCommands> = {
    async replaceTransactionTags(budgetId, tags) {
      const local = await dependencies.requireDatabase(budgetId);
      const existing = await listLocalTags(local);
      const nextIds = new Set(tags.map(({ id }) => id));
      const mutations: LocalBudgetMutation[] = [];
      for (const tag of existing) {
        if (!nextIds.has(tag.id)) {
          const mutation = dependencies.createMutation(budgetId, "transactionTags", tag.id, "delete", null);
          mutations.push(mutation);
        }
      }
      for (const tag of tags) {
        const mutation = dependencies.createMutation(budgetId, "transactionTags", tag.id, "upsert", tag);
        mutations.push(mutation);
      }
      if (mutations.length > 0) await local.mutateBatch(mutations);
      return committedCommandResult(tags, mutations, mutations.length > 0
        ? persistenceScopeForMutations(budgetId, mutations)
        : emptyCommandChange(budgetId));
    },

    async replaceTransactionTagsHistoryState(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const current = await listLocalTags(local);
      if (JSON.stringify(current) !== JSON.stringify(input.expected)) {
        throw new Error("TRANSACTION_TAG_HISTORY_CONFLICT");
      }
      return commands.replaceTransactionTags(input.budgetId, input.replacement);
    },
  };
  return commands;
}
