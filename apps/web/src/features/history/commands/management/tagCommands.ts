import type { TransactionTagDefinition } from "../../../tags/transactionTagTypes";
import type { ApplicationHistoryContext } from "../../applicationHistory";
import type { UndoableCommand } from "../../undoRedo";

export function replaceTransactionTagsCommand(input: {
  id: string; label: string;
  mutate: (tags: readonly TransactionTagDefinition[]) => readonly TransactionTagDefinition[];
}): UndoableCommand<ApplicationHistoryContext> {
  let before: readonly TransactionTagDefinition[] = [];
  let after: readonly TransactionTagDefinition[] = [];
  return {
    id: input.id, label: input.label,
    async execute(context) {
      const queries = context.persistence.accountRegisterQueries;
      if (!queries) throw new Error("Tag history requires authoritative SQLite persistence.");
      before = await queries.listTransactionTags(context.budgetId);
      after = input.mutate(before).map((tag) => ({ ...tag }));
      await queries.replaceTransactionTagsHistoryState({ budgetId: context.budgetId, expected: before, replacement: after });
    },
    async undo(context) {
      await context.persistence.accountRegisterQueries!.replaceTransactionTagsHistoryState({ budgetId: context.budgetId, expected: after, replacement: before });
    },
    async redo(context) {
      await context.persistence.accountRegisterQueries!.replaceTransactionTagsHistoryState({ budgetId: context.budgetId, expected: before, replacement: after });
    },
  };
}

export function setTransactionTagsCommand(
  id: string,
  label: string,
  replacement: readonly TransactionTagDefinition[],
) {
  return replaceTransactionTagsCommand({ id, label, mutate: () => replacement });
}
