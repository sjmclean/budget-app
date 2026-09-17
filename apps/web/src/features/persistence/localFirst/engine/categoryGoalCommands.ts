import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import {
  categoryGoalsEqual,
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
  readonly discardFailedMutation: (mutationId: string) => void;
  readonly recordCommittedChange: (
    budgetId: string,
    change: Omit<PersistenceChangeScope, "budgetId">,
  ) => void;
}

/** Final implementation owner for ordinary Category Goal commands. */
export function createCategoryGoalCommands(
  dependencies: CategoryGoalCommandDependencies,
): CategoryGoalCommands {
  const recordGoalChange = (budgetId: string, categoryId: string) => {
    dependencies.recordCommittedChange(budgetId, {
      domains: ["goals", "budget"],
      categoryIds: [categoryId],
    });
  };

  return {
    async createCategoryGoal(goal) {
      const local = await dependencies.requireDatabase(goal.budgetId);
      const canonical = normaliseCategoryGoalForPersistence(goal);
      const mutation = dependencies.createMutation(
        goal.budgetId,
        "categoryGoals",
        goal.categoryId,
        "upsert",
        canonical,
      );
      const result = await local.writeCategoryGoal("create", canonical, mutation);
      recordGoalChange(goal.budgetId, goal.categoryId);
      return result;
    },

    async updateCategoryGoal(goal) {
      const local = await dependencies.requireDatabase(goal.budgetId);
      const canonical = normaliseCategoryGoalForPersistence(goal);
      const mutation = dependencies.createMutation(
        goal.budgetId,
        "categoryGoals",
        goal.categoryId,
        "upsert",
        canonical,
      );
      const result = await local.writeCategoryGoal("update", canonical, mutation);
      recordGoalChange(goal.budgetId, goal.categoryId);
      return result;
    },

    async deleteCategoryGoal(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const mutation = dependencies.createMutation(
        input.budgetId,
        "categoryGoals",
        input.categoryId,
        "delete",
        null,
      );
      const result = await local.deleteCategoryGoal(
        input.budgetId,
        input.categoryId,
        mutation,
      );
      if (result === null) {
        dependencies.discardFailedMutation(mutation.mutationId);
        return result;
      }
      recordGoalChange(input.budgetId, input.categoryId);
      return result;
    },

    async replaceCategoryGoalHistoryState(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const replacement = input.replacement
        ? normaliseCategoryGoalForPersistence(input.replacement)
        : null;
      const mutation = dependencies.createMutation(
        input.budgetId,
        "categoryGoals",
        input.categoryId,
        replacement ? "upsert" : "delete",
        replacement,
      );
      const result = await local.replaceCategoryGoalHistoryState({
        ...input,
        replacement,
        mutation,
      });
      if (categoryGoalsEqual(input.expected, replacement)) {
        dependencies.discardFailedMutation(mutation.mutationId);
        return result;
      }
      recordGoalChange(input.budgetId, input.categoryId);
      return result;
    },
  };
}
