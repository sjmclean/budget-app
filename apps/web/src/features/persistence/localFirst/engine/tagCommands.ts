import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import type { TransactionTagDefinition } from "../../../tags/transactionTagTypes";
import type { LocalBudgetMutation } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { persistenceScopeForMutations } from "../mutationEvents";

type TagCommands = Pick<
  LocalBudgetRuntimeClient,
  "listTransactionTags" | "replaceTransactionTags" | "replaceTransactionTagsHistoryState"
>;

export interface TagCommandDependencies {
  readonly synchronise: (budgetId: string) => Promise<void>;
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: (budgetId: string, domain: LocalBudgetMutation["domain"], entityId: string,
    operation: LocalBudgetMutation["operation"], payload: unknown) => LocalBudgetMutation;
  readonly recordCommittedChange: (budgetId: string, change: Omit<PersistenceChangeScope, "budgetId">) => void;
}

/** Owns tag queries needed by tag history and every ordinary tag write body. */
export function createTagCommands(dependencies: TagCommandDependencies): TagCommands {
  const commands: TagCommands = {
    async listTransactionTags(budgetId) {
      await dependencies.synchronise(budgetId);
      return (await dependencies.requireDatabase(budgetId)).listEntities("transactionTags");
    },

    async replaceTransactionTags(budgetId, tags) {
      const existing = await commands.listTransactionTags(budgetId);
      const local = await dependencies.requireDatabase(budgetId);
      const nextIds = new Set(tags.map(({ id }) => id));
      for (const tag of existing) {
        if (!nextIds.has(tag.id)) {
          const mutation = dependencies.createMutation(budgetId, "transactionTags", tag.id, "delete", null);
          await local.mutate(mutation);
          dependencies.recordCommittedChange(budgetId, persistenceScopeForMutations(budgetId, [mutation]));
        }
      }
      for (const tag of tags) {
        const mutation = dependencies.createMutation(budgetId, "transactionTags", tag.id, "upsert", tag);
        await local.mutate(mutation);
        dependencies.recordCommittedChange(budgetId, persistenceScopeForMutations(budgetId, [mutation]));
      }
      return tags;
    },

    async replaceTransactionTagsHistoryState(input) {
      const current = await commands.listTransactionTags(input.budgetId);
      if (JSON.stringify(current) !== JSON.stringify(input.expected)) {
        throw new Error("TRANSACTION_TAG_HISTORY_CONFLICT");
      }
      return commands.replaceTransactionTags(input.budgetId, input.replacement);
    },
  };
  return commands;
}
