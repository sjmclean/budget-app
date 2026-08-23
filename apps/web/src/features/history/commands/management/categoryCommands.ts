import type { BudgetMonthView, CreateBudgetCategoryInput } from "../../../budget/budgetViewTypes";
import type { CategoryPersistencePort } from "../../../budget/categoryPersistencePort";
import type { ApplicationHistoryContext } from "../../applicationHistory";
import type { UndoableCommand } from "../../undoRedo";

type CategoryMutation = (port: CategoryPersistencePort) => Promise<BudgetMonthView>;

function queries(context: ApplicationHistoryContext) {
  const value = context.persistence.accountRegisterQueries;
  if (!value) throw new Error("Category history requires authoritative SQLite persistence.");
  return value;
}

export function categoryHistoryCommand(input: {
  readonly id: string; readonly label: string; readonly month: string; readonly mutate: CategoryMutation;
}): UndoableCommand<ApplicationHistoryContext> {
  let before: BudgetMonthView | null = null;
  let after: BudgetMonthView | null = null;
  return {
    id: input.id, label: input.label,
    async execute(context) {
      before = await queries(context).getBudgetMonthView({ budgetId: context.budgetId, month: input.month });
      await input.mutate(context.persistence.categories);
      after = await queries(context).getBudgetMonthView({ budgetId: context.budgetId, month: input.month });
    },
    async undo(context) {
      if (!before || !after) throw new Error("Category command has incomplete state.");
      await queries(context).replaceBudgetMonthHistoryState({ budgetId: context.budgetId, month: input.month, expected: after, replacement: before });
    },
    async redo(context) {
      if (!before || !after) throw new Error("Category command has incomplete state.");
      await queries(context).replaceBudgetMonthHistoryState({ budgetId: context.budgetId, month: input.month, expected: before, replacement: after });
    },
  };
}

export function createCategoryCommand(write: CreateBudgetCategoryInput) {
  return categoryHistoryCommand({ id: `create-category:${write.categoryId}`, label: "Create category", month: write.month, mutate: (port) => port.createCategory(write) });
}
export function renameCategoryCommand(write: Parameters<CategoryPersistencePort["renameCategory"]>[0]) {
  return categoryHistoryCommand({ id: `rename-category:${write.categoryId}:${Date.now()}`, label: "Rename category", month: write.month, mutate: (port) => port.renameCategory(write) });
}
export function archiveCategoryCommand(write: Parameters<CategoryPersistencePort["setCategoryArchived"]>[0]) {
  return categoryHistoryCommand({ id: `archive-category:${write.categoryId}:${Date.now()}`, label: write.isArchived ? "Archive category" : "Restore category", month: write.month, mutate: (port) => port.setCategoryArchived(write) });
}
export function moveCategoryCommand(write: Parameters<CategoryPersistencePort["moveCategory"]>[0]) {
  return categoryHistoryCommand({ id: `move-category:${write.categoryId}:${Date.now()}`, label: "Move category", month: write.month, mutate: (port) => port.moveCategory(write) });
}
export function positionCategoryCommand(write: Parameters<CategoryPersistencePort["moveCategoryToPosition"]>[0]) {
  return categoryHistoryCommand({ id: `position-category:${write.categoryId}:${Date.now()}`, label: "Move category", month: write.month, mutate: (port) => port.moveCategoryToPosition(write) });
}
export function updateCategoryNoteCommand(write: Parameters<CategoryPersistencePort["updateCategoryNote"]>[0]) {
  return categoryHistoryCommand({ id: `category-note:${write.categoryId}:${Date.now()}`, label: "Update category note", month: write.month, mutate: (port) => port.updateCategoryNote(write) });
}
export function moveCategoryGroupCommand(write: Parameters<CategoryPersistencePort["moveCategoryGroup"]>[0]) {
  return categoryHistoryCommand({ id: `move-category-group:${write.groupId}:${Date.now()}`, label: "Move category group", month: write.month, mutate: (port) => port.moveCategoryGroup(write) });
}
export function positionCategoryGroupCommand(write: Parameters<CategoryPersistencePort["moveCategoryGroupToPosition"]>[0]) {
  return categoryHistoryCommand({ id: `position-category-group:${write.groupId}:${Date.now()}`, label: "Move category group", month: write.month, mutate: (port) => port.moveCategoryGroupToPosition(write) });
}
export function updateCategoryGroupNoteCommand(write: Parameters<CategoryPersistencePort["updateCategoryGroupNote"]>[0]) {
  return categoryHistoryCommand({ id: `category-group-note:${write.groupId}:${Date.now()}`, label: "Update category group note", month: write.month, mutate: (port) => port.updateCategoryGroupNote(write) });
}
