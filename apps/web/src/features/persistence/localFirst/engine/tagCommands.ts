import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { TransactionTagDefinition } from "../../../tags/transactionTagTypes";

type TagCommands = Pick<
  LocalBudgetRuntimeClient,
  "listTransactionTags" | "replaceTransactionTags" | "replaceTransactionTagsHistoryState"
>;

export interface TagCommandDependencies {
  readonly synchronise: (budgetId: string) => Promise<void>;
  readonly listTags: (budgetId: string) => Promise<readonly TransactionTagDefinition[]>;
  readonly writeTag: (
    budgetId: string,
    tag: TransactionTagDefinition,
  ) => Promise<void>;
  readonly deleteTag: (budgetId: string, tagId: string) => Promise<void>;
}

/** Owns tag queries needed by tag history and every ordinary tag write body. */
export function createTagCommands(dependencies: TagCommandDependencies): TagCommands {
  const commands: TagCommands = {
    async listTransactionTags(budgetId) {
      await dependencies.synchronise(budgetId);
      return dependencies.listTags(budgetId);
    },

    async replaceTransactionTags(budgetId, tags) {
      const existing = await commands.listTransactionTags(budgetId);
      const nextIds = new Set(tags.map(({ id }) => id));
      for (const tag of existing) {
        if (!nextIds.has(tag.id)) await dependencies.deleteTag(budgetId, tag.id);
      }
      for (const tag of tags) await dependencies.writeTag(budgetId, tag);
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
