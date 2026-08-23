import { useCallback } from "react";
import { applicationHistory, archiveCategoryCommand, createCategoryCommand, moveCategoryCommand, moveCategoryGroupCommand, positionCategoryCommand, positionCategoryGroupCommand, renameCategoryCommand, setCategoryOverspendingHandlingCommand, updateCategoryGroupNoteCommand, updateCategoryNoteCommand, type UndoRedoResult } from "../history";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import { getBudgetPersistenceProvider } from "../persistence";
import type { CategoryPersistencePort } from "./categoryPersistencePort";

function requirePerformed(result: UndoRedoResult) { if (!result.performed) throw new Error(result.error ?? "Category history action failed."); }

export function useCategoryHistory(budgetId: string, month: string) {
  const execute = useCallback(async (command: Parameters<typeof applicationHistory.execute>[1]) => {
    requirePerformed(await applicationHistory.execute(budgetId, command));
    return getBudgetPersistenceProvider().categories.getBudgetMonthView({ budgetId, month });
  }, [budgetId, month]);
  return {
    createCategory: useCallback((input: Omit<Parameters<CategoryPersistencePort["createCategory"]>[0], "budgetId" | "month">) => execute(createCategoryCommand({ budgetId, month, categoryId: createRuntimeUuid(), ...input })), [budgetId, execute, month]),
    renameCategory: useCallback((input: Omit<Parameters<CategoryPersistencePort["renameCategory"]>[0], "budgetId" | "month">) => execute(renameCategoryCommand({ budgetId, month, ...input })), [budgetId, execute, month]),
    setCategoryArchived: useCallback((input: Omit<Parameters<CategoryPersistencePort["setCategoryArchived"]>[0], "budgetId" | "month">) => execute(archiveCategoryCommand({ budgetId, month, ...input })), [budgetId, execute, month]),
    moveCategory: useCallback((input: Omit<Parameters<CategoryPersistencePort["moveCategory"]>[0], "budgetId" | "month">) => execute(moveCategoryCommand({ budgetId, month, ...input })), [budgetId, execute, month]),
    moveCategoryToPosition: useCallback((input: Omit<Parameters<CategoryPersistencePort["moveCategoryToPosition"]>[0], "budgetId" | "month">) => execute(positionCategoryCommand({ budgetId, month, ...input })), [budgetId, execute, month]),
    moveCategoryGroup: useCallback((input: Omit<Parameters<CategoryPersistencePort["moveCategoryGroup"]>[0], "budgetId" | "month">) => execute(moveCategoryGroupCommand({ budgetId, month, ...input })), [budgetId, execute, month]),
    moveCategoryGroupToPosition: useCallback((input: Omit<Parameters<CategoryPersistencePort["moveCategoryGroupToPosition"]>[0], "budgetId" | "month">) => execute(positionCategoryGroupCommand({ budgetId, month, ...input })), [budgetId, execute, month]),
    updateCategoryNote: useCallback((input: Omit<Parameters<CategoryPersistencePort["updateCategoryNote"]>[0], "budgetId" | "month">) => execute(updateCategoryNoteCommand({ budgetId, month, ...input })), [budgetId, execute, month]),
    updateCategoryGroupNote: useCallback((input: Omit<Parameters<CategoryPersistencePort["updateCategoryGroupNote"]>[0], "budgetId" | "month">) => execute(updateCategoryGroupNoteCommand({ budgetId, month, ...input })), [budgetId, execute, month]),
    setCategoryOverspendingHandling: useCallback((input: Omit<Parameters<CategoryPersistencePort["setCategoryOverspendingHandling"]>[0], "budgetId" | "month">) => execute(setCategoryOverspendingHandlingCommand({ budgetId, month, ...input })), [budgetId, execute, month]),
  };
}
