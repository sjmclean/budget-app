import { useCallback, useMemo } from "react";
import type { UpdatePayeeInput } from "./payeeService";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import { applicationHistory } from "../history/applicationHistory";
import { createPayeeCommand, deleteUnusedPayeeCommand, setPayeeArchivedCommand, updatePayeeCommand } from "../history/commands/management/payeeCommands";
import { getBudgetPersistenceProvider } from "../persistence";

export function usePayeeHistory(budgetId: string | null) {
  const execute = useCallback(async (command: Parameters<typeof applicationHistory.execute>[1]) => {
    if (!budgetId) throw new Error("A budget is required for payee history.");
    const result = await applicationHistory.execute(budgetId, command);
    if (!result.performed) throw new Error(result.error ?? "Payee history command failed.");
    return [...await getBudgetPersistenceProvider().accountRegisterQueries!.listPayees(budgetId, false)];
  }, [budgetId]);
  return useMemo(() => ({
    createPayee: (name: string) => execute(createPayeeCommand(createRuntimeUuid(), name)),
    updatePayee: (input: Pick<UpdatePayeeInput, "id"> & Partial<Omit<UpdatePayeeInput, "id">>) => execute(updatePayeeCommand(input)),
    setPayeeArchived: (payeeId: string, archived: boolean) => execute(setPayeeArchivedCommand(payeeId, archived)),
    deleteUnusedPayee: (payeeId: string) => execute(deleteUnusedPayeeCommand(payeeId)),
  }), [execute]);
}
