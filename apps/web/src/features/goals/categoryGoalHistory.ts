import type { CategoryGoal } from "../../../../../packages/types/src/CategoryGoal";
import type { CategoryGoalType } from "../../../../../packages/types/src/CategoryGoalType";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import {
  applicationHistory,
  createCategoryGoalCommand,
  deleteCategoryGoalCommand,
  updateCategoryGoalCommand,
  type ApplicationHistoryContext,
  type ApplicationHistoryService,
  type UndoRedoResult,
} from "../history";

export interface CategoryGoalHistoryService {
  createCategoryGoal(goal: CategoryGoal): Promise<UndoRedoResult>;
  createNewCategoryGoal(input: CategoryGoalConfigurationInput): Promise<UndoRedoResult>;
  updateCategoryGoal(goal: CategoryGoal): Promise<UndoRedoResult>;
  updateCategoryGoalConfiguration(input: UpdateCategoryGoalConfigurationInput): Promise<UndoRedoResult>;
  deleteCategoryGoal(input: { budgetId: string; categoryId: string }): Promise<UndoRedoResult>;
}

export interface CategoryGoalConfigurationInput {
  budgetId: string;
  categoryId: string;
  type: CategoryGoalType;
  targetAmount: number;
  targetMonth: string | null;
}

export interface UpdateCategoryGoalConfigurationInput {
  goal: CategoryGoal;
  type: CategoryGoalType;
  targetAmount: number;
  targetMonth: string | null;
}

export interface CategoryGoalIdentityClock {
  createId(): string;
  now(): string;
}

const runtimeIdentityClock: CategoryGoalIdentityClock = {
  createId: createRuntimeUuid,
  now: () => new Date().toISOString(),
};

export function createCategoryGoalHistoryService(
  history: ApplicationHistoryService<ApplicationHistoryContext> = applicationHistory,
  identityClock: CategoryGoalIdentityClock = runtimeIdentityClock,
): CategoryGoalHistoryService {
  return {
    createCategoryGoal: (goal) => history.execute(goal.budgetId, createCategoryGoalCommand(goal)),
    createNewCategoryGoal: (input) => {
      const timestamp = identityClock.now();
      return history.execute(input.budgetId, createCategoryGoalCommand({
        id: identityClock.createId(),
        ...input,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
    },
    updateCategoryGoal: (goal) => history.execute(goal.budgetId, updateCategoryGoalCommand(goal)),
    updateCategoryGoalConfiguration: (input) => history.execute(
      input.goal.budgetId,
      updateCategoryGoalCommand({
        ...input.goal,
        type: input.type,
        targetAmount: input.targetAmount,
        targetMonth: input.targetMonth,
        updatedAt: identityClock.now(),
      }),
    ),
    deleteCategoryGoal: (input) => history.execute(input.budgetId, deleteCategoryGoalCommand(input)),
  };
}

export const categoryGoalHistory = createCategoryGoalHistoryService();
