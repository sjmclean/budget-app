import type { TransactionWriteInput } from "../../../persistence/accountRegisterQueryContracts";
import type { TransactionHistorySnapshot } from "../../../persistence";
import type { ApplicationHistoryContext } from "../../applicationHistory";
import type { UndoableCommand } from "../../undoRedo";

function queries(context: ApplicationHistoryContext) {
  const value = context.persistence.accountRegisterQueries;
  if (!value) throw new Error("Transaction history requires authoritative SQLite persistence.");
  return value;
}

function label(action: string, count: number): string {
  return count === 1 ? `${action} transaction` : `${action} ${count} transactions`;
}

export function createDeleteTransactionsCommand(
  transactionIds: readonly string[],
): UndoableCommand<ApplicationHistoryContext> {
  const ids = [...new Set(transactionIds)];
  let snapshot: TransactionHistorySnapshot | null = null;
  return {
    id: `delete-transactions:${ids.join("|")}:${Date.now()}`,
    label: label("Delete", ids.length),
    async execute(context) {
      snapshot = await queries(context).captureTransactionHistorySnapshots({ budgetId: context.budgetId, transactionIds: ids });
      await queries(context).deleteTransactionHistorySnapshot(snapshot);
    },
    async undo(context) {
      if (!snapshot) throw new Error("Delete command has not captured its transaction graph.");
      await queries(context).restoreTransactionHistorySnapshot(snapshot);
    },
    async redo(context) {
      if (!snapshot) throw new Error("Delete command has not captured its transaction graph.");
      await queries(context).deleteTransactionHistorySnapshot(snapshot);
    },
  };
}

export function createAddTransactionCommand(input: {
  readonly transactionId: string;
  readonly write: TransactionWriteInput;
}): UndoableCommand<ApplicationHistoryContext> {
  let after: TransactionHistorySnapshot | null = null;
  return {
    id: `add-transaction:${input.transactionId}`,
    label: "Add transaction",
    async execute(context) {
      await queries(context).addTransaction({ ...input.write, id: input.transactionId, budgetId: context.budgetId });
      after = await queries(context).captureTransactionHistorySnapshots({ budgetId: context.budgetId, transactionIds: [input.transactionId] });
    },
    async undo(context) {
      if (!after) throw new Error("Add command has not captured its transaction graph.");
      await queries(context).deleteTransactionHistorySnapshot(after);
    },
    async redo(context) {
      if (!after) throw new Error("Add command has not captured its transaction graph.");
      await queries(context).restoreTransactionHistorySnapshot(after);
    },
  };
}

function createGraphChangeCommand(input: {
  readonly id: string;
  readonly label: string;
  readonly transactionIds: readonly string[];
  readonly mutate: (context: ApplicationHistoryContext) => Promise<void>;
}): UndoableCommand<ApplicationHistoryContext> {
  let before: TransactionHistorySnapshot | null = null;
  let after: TransactionHistorySnapshot | null = null;
  return {
    id: input.id,
    label: input.label,
    async execute(context) {
      before = await queries(context).captureTransactionHistorySnapshots({ budgetId: context.budgetId, transactionIds: input.transactionIds });
      await input.mutate(context);
      after = await queries(context).captureTransactionHistorySnapshots({ budgetId: context.budgetId, transactionIds: input.transactionIds });
    },
    async undo(context) {
      if (!before || !after) throw new Error("Transaction command has not captured before and after state.");
      await queries(context).replaceTransactionHistorySnapshot({ expected: after, replacement: before });
    },
    async redo(context) {
      if (!before || !after) throw new Error("Transaction command has not captured before and after state.");
      await queries(context).replaceTransactionHistorySnapshot({ expected: before, replacement: after });
    },
  };
}

export function createEditTransactionCommand(input: {
  readonly transactionId: string;
  readonly write: TransactionWriteInput;
}): UndoableCommand<ApplicationHistoryContext> {
  return createGraphChangeCommand({
    id: `edit-transaction:${input.transactionId}:${Date.now()}`,
    label: "Edit transaction",
    transactionIds: [input.transactionId],
    mutate: async (context) => queries(context).updateTransaction(input.transactionId, { ...input.write, budgetId: context.budgetId }),
  });
}

export function createSetTransactionsClearedCommand(input: {
  readonly transactionIds: readonly string[];
  readonly cleared: boolean;
}): UndoableCommand<ApplicationHistoryContext> {
  const ids = [...new Set(input.transactionIds)];
  return createGraphChangeCommand({
    id: `set-transactions-cleared:${ids.join("|")}:${Date.now()}`,
    label: label(input.cleared ? "Clear" : "Unclear", ids.length),
    transactionIds: ids,
    mutate: async (context) => queries(context).setTransactionsCleared({ budgetId: context.budgetId, transactionIds: ids, cleared: input.cleared }),
  });
}

export function createToggleTransactionClearedCommand(
  transactionId: string,
): UndoableCommand<ApplicationHistoryContext> {
  let before: TransactionHistorySnapshot | null = null;
  let after: TransactionHistorySnapshot | null = null;
  let cleared = true;
  return {
    id: `toggle-transaction-cleared:${transactionId}:${Date.now()}`,
    get label() { return cleared ? "Clear transaction" : "Unclear transaction"; },
    async execute(context) {
      before = await queries(context).captureTransactionHistorySnapshots({ budgetId: context.budgetId, transactionIds: [transactionId] });
      const transaction = before.transactions.find(({ id }) => id === transactionId);
      if (!transaction) throw new Error("Transaction was not found in its captured graph.");
      cleared = transaction.clearedStatus !== "cleared";
      await queries(context).setTransactionsCleared({ budgetId: context.budgetId, transactionIds: [transactionId], cleared });
      after = await queries(context).captureTransactionHistorySnapshots({ budgetId: context.budgetId, transactionIds: [transactionId] });
    },
    async undo(context) {
      if (!before || !after) throw new Error("Clear command has not captured before and after state.");
      await queries(context).replaceTransactionHistorySnapshot({ expected: after, replacement: before });
    },
    async redo(context) {
      if (!before || !after) throw new Error("Clear command has not captured before and after state.");
      await queries(context).replaceTransactionHistorySnapshot({ expected: before, replacement: after });
    },
  };
}

export function createMoveTransactionsCommand(input: {
  readonly sourceAccountId: string;
  readonly targetAccountId: string;
  readonly transactionIds: readonly string[];
}): UndoableCommand<ApplicationHistoryContext> {
  const ids = [...new Set(input.transactionIds)];
  return createGraphChangeCommand({
    id: `move-transactions:${ids.join("|")}:${Date.now()}`,
    label: label("Move", ids.length),
    transactionIds: ids,
    mutate: async (context) => queries(context).moveTransactions({
      budgetId: context.budgetId,
      sourceAccountId: input.sourceAccountId,
      targetAccountId: input.targetAccountId,
      transactionIds: ids,
    }),
  });
}
