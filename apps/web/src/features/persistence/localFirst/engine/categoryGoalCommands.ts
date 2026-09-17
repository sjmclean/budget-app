import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import {
  categoryGoalsEqual,
  commitCategoryGoalMutation,
  normaliseCategoryGoalForPersistence,
} from "../categoryGoalPersistence";
import type { LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";

type CategoryGoalCommands = Pick<
  LocalBudgetRuntimeClient,
  | "createCategoryGoal"
  | "updateCategoryGoal"
  | "deleteCategoryGoal"
  | "replaceCategoryGoalHistoryState"
>;

type CreateMutation = (
  budgetId: string,
  domain: LocalBudgetMutation["domain"],
  entityId: string,
  operation: LocalBudgetMutation["operation"],
  payload: unknown,
  operationGroupId?: string,
  operationGroup?: LocalBudgetOperationGroup,
) => LocalBudgetMutation;

export interface CategoryGoalCommandDependencies {
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: CreateMutation;
  readonly recordCommittedChange: (
    budgetId: string,
    change: Omit<PersistenceChangeScope, "budgetId">,
  ) => void;
}

/** Final implementation owner for ordinary Category Goal commands. */
export function createCategoryGoalCommands(
  dependencies: CategoryGoalCommandDependencies,
): CategoryGoalCommands {
  const recordGoalChange = (budgetId: string, categoryId?: string) => {
    dependencies.recordCommittedChange(budgetId, {
      domains: ["goals", "budget"],
      categoryIds: categoryId ? [categoryId] : undefined,
    });
  };

  return {
    async createCategoryGoal(goal) {
      const local = await dependencies.requireDatabase(goal.budgetId);
      const canonical = normaliseCategoryGoalForPersistence(goal);
      return commitCategoryGoalMutation(
        goal.budgetId,
        () => local.writeCategoryGoal(
          "create",
          canonical,
          dependencies.createMutation(
            goal.budgetId,
            "categoryGoals",
            goal.categoryId,
            "upsert",
            canonical,
          ),
        ),
        undefined,
        goal.categoryId,
        recordGoalChange,
      );
    },

    async updateCategoryGoal(goal) {
      const local = await dependencies.requireDatabase(goal.budgetId);
      const canonical = normaliseCategoryGoalForPersistence(goal);
      return commitCategoryGoalMutation(
        goal.budgetId,
        () => local.writeCategoryGoal(
          "update",
          canonical,
          dependencies.createMutation(
            goal.budgetId,
            "categoryGoals",
            goal.categoryId,
            "upsert",
            canonical,
          ),
        ),
        undefined,
        goal.categoryId,
        recordGoalChange,
      );
    },

    async deleteCategoryGoal(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      return commitCategoryGoalMutation(
        input.budgetId,
        () => local.deleteCategoryGoal(
          input.budgetId,
          input.categoryId,
          dependencies.createMutation(
            input.budgetId,
            "categoryGoals",
            input.categoryId,
            "delete",
            null,
          ),
        ),
        (result) => result !== null,
        input.categoryId,
        recordGoalChange,
      );
    },

    async replaceCategoryGoalHistoryState(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const replacement = input.replacement
        ? normaliseCategoryGoalForPersistence(input.replacement)
        : null;
      return commitCategoryGoalMutation(
        input.budgetId,
        () => local.replaceCategoryGoalHistoryState({
          ...input,
          replacement,
          mutation: dependencies.createMutation(
            input.budgetId,
            "categoryGoals",
            input.categoryId,
            replacement ? "upsert" : "delete",
            replacement,
          ),
        }),
        () => !categoryGoalsEqual(input.expected, replacement),
        input.categoryId,
        recordGoalChange,
      );
    },
  };
}
