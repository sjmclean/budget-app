import type { BudgetViewService } from "../budget/budgetViewTypes";
import { projectCategoryGoalsOntoBudgetView } from "../budget/categoryGoalBudgetProjection";
import type { BudgetMonthView } from "../budget/budgetViewTypes";
import type { CategoryMutation, LocalBudgetCommandResult, LocalBudgetEngine, LocalBudgetQueryClient } from "./accountRegisterQueryContracts";

type PublishedBudgetCommands = {
  executeCategoryWithPublication?(budgetId: string, input: CategoryMutation): Promise<LocalBudgetCommandResult<BudgetMonthView>>;
  executeAssignmentsWithPublication?(input: Parameters<LocalBudgetEngine["setCategoryAssignedValues"]>[0]): Promise<LocalBudgetCommandResult<BudgetMonthView>>;
};

function markPublication(view: BudgetMonthView, revision: number | null): BudgetMonthView {
  if (revision !== null) Object.defineProperty(view, "publicationRevision", { value: revision, configurable: true });
  return view;
}

const SQLITE_BUDGET_REQUIRED =
  "Budget operations require an active local-first SQLite budget generation.";

async function requireBudgetMonths(
  hosted: LocalBudgetQueryClient | undefined,
  budgetId: string,
): Promise<LocalBudgetQueryClient> {
  if (!hosted) throw new Error(SQLITE_BUDGET_REQUIRED);
  const status = await hosted.getBudgetStatus(budgetId);
  if (!status.capabilities.budgetMonths) throw new Error(SQLITE_BUDGET_REQUIRED);
  return hosted;
}

async function withCategoryGoals(
  client: LocalBudgetQueryClient,
  input: { readonly budgetId: string; readonly month: string },
  view: Promise<Awaited<ReturnType<LocalBudgetQueryClient["getBudgetMonthView"]>>>,
) {
  const [financialView, goals] = await Promise.all([
    view,
    client.listCategoryGoals({ budgetId: input.budgetId }),
  ]);
  return markPublication(projectCategoryGoalsOntoBudgetView(financialView, input.month, goals), financialView.publicationRevision ?? null);
}

export function createSqliteBudgetViewService(
  hosted: LocalBudgetQueryClient | undefined,
  engine: LocalBudgetEngine | undefined,
): BudgetViewService {
  function commands(): LocalBudgetEngine {
    if (!engine) throw new Error(SQLITE_BUDGET_REQUIRED);
    return engine;
  }
  async function mutateCategory(budgetId: string, input: CategoryMutation): Promise<BudgetMonthView> {
    const commandClient = engine as (LocalBudgetEngine & PublishedBudgetCommands) | undefined;
    if (commandClient?.executeCategoryWithPublication) {
      const completion = await commandClient.executeCategoryWithPublication(budgetId, input);
      return markPublication(completion.result, completion.publicationRevision);
    }
    return commands().mutateCategory(budgetId, input);
  }
  async function assign(input: Parameters<LocalBudgetEngine["setCategoryAssignedValues"]>[0]): Promise<BudgetMonthView> {
    const commandClient = engine as (LocalBudgetEngine & PublishedBudgetCommands) | undefined;
    if (commandClient?.executeAssignmentsWithPublication) {
      const completion = await commandClient.executeAssignmentsWithPublication(input);
      return markPublication(completion.result, completion.publicationRevision);
    }
    return commands().setCategoryAssignedValues(input);
  }
  return {
    async getBudgetMonthView(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, client.getBudgetMonthView(input));
    },
    async updateAssigned(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, assign({
        budgetId: input.budgetId,
        month: input.month,
        assignments: [{ categoryId: input.categoryId, assigned: input.assigned }],
      }));
    },
    async setCategoryAssignedValues(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, assign(input));
    },
    async setCategoryOverspendingHandling(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, mutateCategory(input.budgetId, {
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
      return withCategoryGoals(client, input, assign({
        budgetId: input.budgetId,
        month: input.month,
        assignments: [
          { categoryId: source.id, assigned: source.assigned - input.amount },
          { categoryId: target.id, assigned: target.assigned + input.amount },
        ],
      }));
    },
    async createCategory(input) {
      return mutateCategory(input.budgetId, {
        operation: "create",
        ...input,
      });
    },
    async renameCategory(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, mutateCategory(input.budgetId, {
        operation: "rename",
        ...input,
      }));
    },
    async setCategoryArchived(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, mutateCategory(input.budgetId, {
        operation: "archive",
        ...input,
      }));
    },
    async moveCategory(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, mutateCategory(input.budgetId, {
        operation: "move-category",
        ...input,
      }));
    },
    async moveCategoryToPosition(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, mutateCategory(input.budgetId, {
        operation: "position-category",
        ...input,
      }));
    },
    async moveCategoryGroup(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, mutateCategory(input.budgetId, {
        operation: "move-group",
        ...input,
      }));
    },
    async moveCategoryGroupToPosition(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, mutateCategory(input.budgetId, {
        operation: "position-group",
        ...input,
      }));
    },
    async updateCategoryNote(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, mutateCategory(input.budgetId, {
        operation: "category-note",
        ...input,
      }));
    },
    async updateCategoryGroupNote(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, mutateCategory(input.budgetId, {
        operation: "group-note",
        ...input,
      }));
    },
    async getCategoryMergePreview(input) {
      return (await requireBudgetMonths(hosted, input.budgetId)).getCategoryMergePreview(input);
    },
    async mergeCategory(input) {
      const client = await requireBudgetMonths(hosted, input.budgetId);
      return withCategoryGoals(client, input, mutateCategory(input.budgetId, {
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
