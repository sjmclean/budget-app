import {
  applicationHistory,
  type ApplicationHistoryContext,
  type UndoableCommand,
  type UndoRedoResult,
} from "../history";
import {
  createBudgetAssignmentChangesCommand,
  type BudgetAssignmentChangesCommandInput,
} from "./budgetAssignmentEditing";
import {
  createBudgetViewMoneyMovementContext,
  createMoveBudgetMoneyCommand,
  createMoveBudgetMoneyFromMultipleSourcesCommand,
  type BudgetMoneyMovementContext,
  type MoveBudgetMoneyCommandInput,
  type MoveBudgetMoneyFromMultipleSourcesCommandInput,
} from "./budgetMoneyMovement";

export function adaptBudgetCommandToApplicationHistory(
  command: UndoableCommand<BudgetMoneyMovementContext>,
): UndoableCommand<ApplicationHistoryContext> {
  const contextFor = (context: ApplicationHistoryContext) =>
    createBudgetViewMoneyMovementContext({
      budgetId: context.budgetId,
      budgetViewService: context.persistence.budgetView,
    });
  return {
    id: command.id,
    get label() { return command.label; },
    execute: (context) => command.execute(contextFor(context)),
    undo: (context) => command.undo(contextFor(context)),
    redo: command.redo
      ? (context) => command.redo?.(contextFor(context))
      : undefined,
  };
}

export function executeApplicationBudgetAssignmentChanges(
  budgetId: string,
  input: BudgetAssignmentChangesCommandInput,
): Promise<UndoRedoResult> {
  return applicationHistory.execute(
    budgetId,
    adaptBudgetCommandToApplicationHistory(createBudgetAssignmentChangesCommand(input)),
  );
}

export function executeApplicationBudgetMoneyMovement(
  budgetId: string,
  input: MoveBudgetMoneyCommandInput,
): Promise<UndoRedoResult> {
  return applicationHistory.execute(
    budgetId,
    adaptBudgetCommandToApplicationHistory(createMoveBudgetMoneyCommand(input)),
  );
}

export function executeApplicationBudgetMoneyMovementFromMultipleSources(
  budgetId: string,
  input: MoveBudgetMoneyFromMultipleSourcesCommandInput,
): Promise<UndoRedoResult> {
  return applicationHistory.execute(
    budgetId,
    adaptBudgetCommandToApplicationHistory(createMoveBudgetMoneyFromMultipleSourcesCommand(input)),
  );
}
