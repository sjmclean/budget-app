import { useCallback } from "react";
import { applicationHistory, createAccountCommand, deleteEmptyAccountCommand, setAccountClosedCommand, updateAccountCommand, type UndoRedoResult } from "../history";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import { getBudgetPersistenceProvider } from "../persistence";
import type { CreateAccountInput, UpdateAccountInput } from "./accountService";

function requirePerformed(result: UndoRedoResult) { if (!result.performed) throw new Error(result.error ?? "Account history action failed."); }

export function useAccountHistory(budgetId: string | null) {
  const execute = useCallback(async (command: Parameters<typeof applicationHistory.execute>[1]) => {
    if (!budgetId) throw new Error("Select a budget before changing accounts.");
    requirePerformed(await applicationHistory.execute(budgetId, command));
    return [...await getBudgetPersistenceProvider().accountRegisterQueries!.listAccounts(budgetId)];
  }, [budgetId]);
  return {
    createAccount: useCallback((input: CreateAccountInput) => execute(createAccountCommand(input.id ?? createRuntimeUuid(), input)), [execute]),
    updateAccount: useCallback((input: UpdateAccountInput) => execute(updateAccountCommand(input)), [execute]),
    closeAccount: useCallback((id: string) => execute(setAccountClosedCommand(id, true)), [execute]),
    reopenAccount: useCallback((id: string) => execute(setAccountClosedCommand(id, false)), [execute]),
    deleteAccount: useCallback(async (id: string) => { const accounts = await execute(deleteEmptyAccountCommand(id)); return { deleted: true as const, accounts }; }, [execute]),
  };
}
