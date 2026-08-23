import { useCallback } from "react";
import {
  applicationHistory,
  createAddTransactionCommand,
  createDeleteTransactionsCommand,
  createEditTransactionCommand,
  createMoveTransactionsCommand,
  createSetTransactionsClearedCommand,
  createToggleTransactionClearedCommand,
  type UndoRedoResult,
} from "../history";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import type { NewRegisterTransactionInput, UpdateRegisterTransactionInput } from "./accountRegisterTypes";
import { toTransactionWriteInput } from "./useAccountRegister";

function requirePerformed(result: UndoRedoResult): void {
  if (!result.performed) throw new Error(result.error ?? `Transaction history ${result.action} failed.`);
}

export function useRegisterTransactionHistory(budgetId: string | null, accountId: string) {
  const execute = useCallback(async (command: Parameters<typeof applicationHistory.execute>[1]) => {
    if (!budgetId) throw new Error("Select a budget before changing transactions.");
    const result = await applicationHistory.execute(budgetId, command);
    requirePerformed(result);
  }, [budgetId]);

  return {
    addTransaction: useCallback(async (
      input: NewRegisterTransactionInput,
      targetAccountId = accountId,
    ) => {
      const transactionId = input.id?.trim() || createRuntimeUuid();
      await execute(createAddTransactionCommand({
        transactionId,
        write: { budgetId: budgetId!, accountId: targetAccountId, ...toTransactionWriteInput(input) },
      }));
    }, [accountId, budgetId, execute]),
    updateTransaction: useCallback(async (input: UpdateRegisterTransactionInput) => {
      await execute(createEditTransactionCommand({
        transactionId: input.id,
        write: { budgetId: budgetId!, accountId, ...toTransactionWriteInput(input) },
      }));
    }, [accountId, budgetId, execute]),
    deleteTransactions: useCallback(async (transactionIds: readonly string[]) => {
      await execute(createDeleteTransactionsCommand(transactionIds));
    }, [execute]),
    toggleCleared: useCallback(async (transactionId: string) => {
      await execute(createToggleTransactionClearedCommand(transactionId));
    }, [execute]),
    setTransactionsCleared: useCallback(async (transactionIds: readonly string[], cleared: boolean) => {
      await execute(createSetTransactionsClearedCommand({ transactionIds, cleared }));
    }, [execute]),
    moveTransactions: useCallback(async (targetAccountId: string, transactionIds: readonly string[]) => {
      await execute(createMoveTransactionsCommand({
        sourceAccountId: accountId,
        targetAccountId,
        transactionIds,
      }));
    }, [accountId, execute]),
  };
}
