import type { BudgetViewService } from "../budget/budgetViewTypes";
import type { HostedAccountRegisterQueryClient } from "./hostedAccountRegisterQueryClient";

const SQLITE_BUDGET_REQUIRED =
  "Budget operations require an active local-first SQLite budget generation.";

async function requireBudgetMonths(
  hosted: HostedAccountRegisterQueryClient | undefined,
  budgetId: string,
): Promise<HostedAccountRegisterQueryClient> {
  if (!hosted) throw new Error(SQLITE_BUDGET_REQUIRED);
  const status = await hosted.getBudgetStatus(budgetId);
  if (!status.capabilities.budgetMonths) throw new Error(SQLITE_BUDGET_REQUIRED);
  return hosted;
}

export function createSqliteBudgetViewService(
  hosted: HostedAccountRegisterQueryClient | undefined,
): BudgetViewService {
  return {
    async getBudgetMonthView(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).getBudgetMonthView(input);
    },
    async updateAssigned(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).setCategoryAssignedValues({
        budgetId: input.budgetId,
        month: input.month,
        assignments: [{ categoryId: input.categoryId, assigned: input.assigned }],
      });
    },
    async setCategoryAssignedValues(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).setCategoryAssignedValues(input);
    },
    async setCategoryOverspendingHandling(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).mutateCategory(input.budgetId, {
        operation: "overspending",
        ...input,
      });
    },
    async coverOverspending(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      const view = await client.getBudgetMonthView(input);
      const categories = view.categoryGroups.flatMap((group) => group.categories);
      const source = categories.find(({ id }) => id === input.coveringCategoryId);
      const target = categories.find(({ id }) => id === input.overspentCategoryId);
      if (!source || !target) throw new Error("The selected budget categories were not found.");
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new Error("Cover amount must be positive.");
      }
      if (source.available < input.amount) {
        throw new Error("Covering category has insufficient available funds.");
      }
      return client.setCategoryAssignedValues({
        budgetId: input.budgetId,
        month: input.month,
        assignments: [
          { categoryId: source.id, assigned: source.assigned - input.amount },
          { categoryId: target.id, assigned: target.assigned + input.amount },
        ],
      });
    },
    async createCategory(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).mutateCategory(input.budgetId, {
        operation: "create",
        ...input,
      });
    },
    async renameCategory(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).mutateCategory(input.budgetId, {
        operation: "rename",
        ...input,
      });
    },
    async setCategoryArchived(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).mutateCategory(input.budgetId, {
        operation: "archive",
        ...input,
      });
    },
    async moveCategory(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).mutateCategory(input.budgetId, {
        operation: "move-category",
        ...input,
      });
    },
    async moveCategoryToPosition(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).mutateCategory(input.budgetId, {
        operation: "position-category",
        ...input,
      });
    },
    async moveCategoryGroup(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).mutateCategory(input.budgetId, {
        operation: "move-group",
        ...input,
      });
    },
    async moveCategoryGroupToPosition(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).mutateCategory(input.budgetId, {
        operation: "position-group",
        ...input,
      });
    },
    async updateCategoryNote(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).mutateCategory(input.budgetId, {
        operation: "category-note",
        ...input,
      });
    },
    async updateCategoryGroupNote(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).mutateCategory(input.budgetId, {
        operation: "group-note",
        ...input,
      });
    },
    async getCategoryMergePreview(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).getCategoryMergePreview(input);
    },
    async mergeCategory(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).mutateCategory(input.budgetId, {
        operation: "merge",
        month: input.month,
        categoryId: input.sourceCategoryId,
        targetCategoryId: input.targetCategoryId,
      });
    },
    async getCategoryOptions(input) {
      return [
        ...(await (await requireBudgetMonths(hosted, input.budgetId))
          .getBudgetCategoryOptions(input)),
      ];
    },
    async getCategoryActivityDrilldown(input) {
      return (await requireBudgetMonths(hosted, input.budgetId))
        .getCategoryActivityDrilldown(input);
    },
  };
}
