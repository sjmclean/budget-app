import type { LocalBudgetEngine } from "../../../persistence/accountRegisterQueryContracts";
import type { ImportHistorySnapshot } from "../../../persistence/localFirst/registerSchema";
import type { ApplicationHistoryContext } from "../../applicationHistory";
import type { UndoableCommand } from "../../undoRedo";

type ImportBatchInput = Parameters<LocalBudgetEngine["commitImportBatchWithHistory"]>[0];

function queries(context: ApplicationHistoryContext) {
  const value = context.persistence.accountRegisterQueries;
  if (!value) throw new Error("Import history requires authoritative SQLite persistence.");
  return value;
}
function engine(context: ApplicationHistoryContext) {
  const value = context.persistence.localBudgetEngine;
  if (!value) throw new Error("Import history requires the Local Budget Engine.");
  return value;
}

export function createImportTransactionsCommand(
  input: ImportBatchInput,
): UndoableCommand<ApplicationHistoryContext> {
  const committedIds = new Set([
    ...input.additions.map(({ id }) => id),
    ...input.provenanceAssignments.map(({ transactionId }) => transactionId),
  ]);
  const count = committedIds.size;
  let before: ImportHistorySnapshot | null = null;
  let after: ImportHistorySnapshot | null = null;
  return {
    id: `import-transactions:${input.accountId}:${Date.now()}`,
    label: `Import ${count} transaction${count === 1 ? "" : "s"}`,
    async execute(context) {
      if (context.budgetId !== input.budgetId) throw new Error("Import command belongs to another budget.");
      ({ before, after } = await engine(context).commitImportBatchWithHistory(input));
    },
    async undo(context) {
      if (!before || !after) throw new Error("Import command has not captured its committed state.");
      await engine(context).replaceImportHistorySnapshot({ expected: after, replacement: before });
    },
    async redo(context) {
      if (!before || !after) throw new Error("Import command has not captured its committed state.");
      await engine(context).replaceImportHistorySnapshot({ expected: before, replacement: after });
    },
  };
}
