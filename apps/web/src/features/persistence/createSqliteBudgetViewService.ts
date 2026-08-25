import type { BudgetViewService } from "../budget/budgetViewTypes";
import { projectCategoryGoalsOntoBudgetView } from "../budget/categoryGoalBudgetProjection";
import type { AccountRegisterQueryClient } from "./accountRegisterQueryContracts";

const SQLITE_BUDGET_REQUIRED =
  "Budget operations require an active local-first SQLite budget generation.";

async function requireBudgetMonths(
  hosted: AccountRegisterQueryClient | undefined,
  budgetId: string,
): Promise<AccountRegisterQueryClient> {
  if (!hosted) throw new Error(SQLITE_BUDGET_REQUIRED);
  const status = await hosted.getBudgetStatus(budgetId);
  if (!status.capabilities.budgetMonths) throw new Error(SQLITE_BUDGET_REQUIRED);
  return hosted;
}

async function withCategoryGoals(
  client: AccountRegisterQueryClient,
  input: { readonly budgetId: string; readonly month: string },
  view: Promise<Awaited<ReturnType<AccountRegisterQueryClient["getBudgetMonthView"]>>>,
) {
  const [financialView, goals] = await Promise.all([
    view,
    client.listCategoryGoals({ budgetId: input.budgetId }),
  ]);
  return projectCategoryGoalsOntoBudgetView(financialView, input.month, goals);
}

export function createSqliteBudgetViewService(
  hosted: AccountRegisterQueryClient | undefined,
): BudgetViewService {
  return {
    async getBudgetMonthView(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.getBudgetMonthView(input));
    },
    async updateAssigned(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.setCategoryAssignedValues({
        budgetId: input.budgetId,
        month: input.month,
        assignments: [{ categoryId: input.categoryId, assigned: input.assigned }],
      }));
    },
    async setCategoryAssignedValues(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.setCategoryAssignedValues(input));
    },
    async setCategoryOverspendingHandling(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.mutateCategory(input.budgetId, {
        operation: "overspending",
        ...input,
      }));
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
      return withCategoryGoals(client, input, client.setCategoryAssignedValues({
        budgetId: input.budgetId,
        month: input.month,
        assignments: [
          { categoryId: source.id, assigned: source.assigned - input.amount },
          { categoryId: target.id, assigned: target.assigned + input.amount },
        ],
      }));
    },
    async createCategory(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.mutateCategory(input.budgetId, {
        operation: "create",
        ...input,
      }));
    },
    async renameCategory(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.mutateCategory(input.budgetId, {
        operation: "rename",
        ...input,
      }));
    },
    async setCategoryArchived(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.mutateCategory(input.budgetId, {
        operation: "archive",
        ...input,
      }));
    },
    async moveCategory(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.mutateCategory(input.budgetId, {
        operation: "move-category",
        ...input,
      }));
    },
    async moveCategoryToPosition(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.mutateCategory(input.budgetId, {
        operation: "position-category",
        ...input,
      }));
    },
    async moveCategoryGroup(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.mutateCategory(input.budgetId, {
        operation: "move-group",
        ...input,
      }));
    },
    async moveCategoryGroupToPosition(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.mutateCategory(input.budgetId, {
        operation: "position-group",
        ...input,
      }));
    },
    async updateCategoryNote(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.mutateCategory(input.budgetId, {
        operation: "category-note",
        ...input,
      }));
    },
    async updateCategoryGroupNote(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.mutateCategory(input.budgetId, {
        operation: "group-note",
        ...input,
      }));
    },
    async getCategoryMergePreview(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).getCategoryMergePreview(input);
    },
    async mergeCategory(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.mutateCategory(input.budgetId, {
        operation: "merge",
        month: input.month,
        categoryId: input.sourceCategoryId,
        targetCategoryId: input.targetCategoryId,
      }));
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
