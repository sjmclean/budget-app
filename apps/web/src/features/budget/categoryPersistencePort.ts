import type { BudgetViewService } from "./budgetViewTypes";

/**
 * Browser-safe category/budget persistence port.
 *
 * Category management currently lives inside the budget view service because the
 * budget screen stores category groups, category ordering, assigned amounts, and
 * merge state together. Keep this as an explicit port so UI code stops importing
 * the concrete localStorage budget service directly while SQLite/Tauri adapters
 * are introduced behind the gateway.
 */
export type CategoryPersistencePort = Pick<
  BudgetViewService,
  | "getBudgetMonthView"
  | "updateAssigned"
  | "coverOverspending"
  | "createCategory"
  | "renameCategory"
  | "setCategoryArchived"
  | "moveCategory"
  | "moveCategoryToPosition"
  | "moveCategoryGroup"
  | "moveCategoryGroupToPosition"
  | "updateCategoryNote"
  | "updateCategoryGroupNote"
  | "getCategoryMergePreview"
  | "mergeCategory"
  | "getCategoryOptions"
  | "getCategoryActivityDrilldown"
>;
