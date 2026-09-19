import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import {
  categoryGoalsEqual,
  normaliseCategoryGoalForPersistence,
} from "../categoryGoalPersistence";
import type { LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { committedCommandResult, emptyCommandChange, type CommittedCommandMethods } from "./commandContext";

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
}

/** Final implementation owner for ordinary Category Goal commands. */
export function createCategoryGoalCommands(
  dependencies: CategoryGoalCommandDependencies,
): CommittedCommandMethods<CategoryGoalCommands> {
  const goalChange = (budgetId: string, categoryId: string): PersistenceChangeScope => ({
      budgetId,
      domains: ["budget", "goals"],
      categoryIds: [categoryId],
    });

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
      return committedCommandResult(result, [mutation], goalChange(goal.budgetId, goal.categoryId));
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
      return committedCommandResult(result, [mutation], goalChange(goal.budgetId, goal.categoryId));
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
        return committedCommandResult(result, [], emptyCommandChange(input.budgetId));
      }
      return committedCommandResult(result, [mutation], goalChange(input.budgetId, input.categoryId));
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
        return committedCommandResult(result, [], emptyCommandChange(input.budgetId));
      }
      return committedCommandResult(result, [mutation], goalChange(input.budgetId, input.categoryId));
    },
  };
}
