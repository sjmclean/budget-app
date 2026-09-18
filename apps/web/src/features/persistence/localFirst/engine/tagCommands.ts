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
  readonly synchronise: (budgetId: string) => Promise<void>;
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: (budgetId: string, domain: LocalBudgetMutation["domain"], entityId: string,
    operation: LocalBudgetMutation["operation"], payload: unknown) => LocalBudgetMutation;
}

/** Owns tag queries needed by tag history and every ordinary tag write body. */
export function createTagCommands(dependencies: TagCommandDependencies):
  CommittedCommandMethods<TagWriteCommands> & Pick<TagCommands, "listTransactionTags"> {
  const listTransactionTags = async (budgetId: string) => {
    await dependencies.synchronise(budgetId);
    return (await dependencies.requireDatabase(budgetId)).listEntities<TransactionTagDefinition>("transactionTags");
  };
  const commands: CommittedCommandMethods<TagWriteCommands> & Pick<TagCommands, "listTransactionTags"> = {
    async listTransactionTags(budgetId) {
      return listTransactionTags(budgetId);
    },

    async replaceTransactionTags(budgetId, tags) {
      const existing = await listTransactionTags(budgetId);
      const local = await dependencies.requireDatabase(budgetId);
      const nextIds = new Set(tags.map(({ id }) => id));
      const mutations: LocalBudgetMutation[] = [];
      for (const tag of existing) {
        if (!nextIds.has(tag.id)) {
          const mutation = dependencies.createMutation(budgetId, "transactionTags", tag.id, "delete", null);
          await local.mutate(mutation);
          mutations.push(mutation);
        }
      }
      for (const tag of tags) {
        const mutation = dependencies.createMutation(budgetId, "transactionTags", tag.id, "upsert", tag);
        await local.mutate(mutation);
        mutations.push(mutation);
      }
      return committedCommandResult(tags, mutations, mutations.length > 0
        ? persistenceScopeForMutations(budgetId, mutations)
        : emptyCommandChange(budgetId));
    },

    async replaceTransactionTagsHistoryState(input) {
      const current = await listTransactionTags(input.budgetId);
      if (JSON.stringify(current) !== JSON.stringify(input.expected)) {
        throw new Error("TRANSACTION_TAG_HISTORY_CONFLICT");
      }
      return commands.replaceTransactionTags(input.budgetId, input.replacement);
    },
  };
  return commands;
}
