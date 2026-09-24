import {
  applicationHistory,
  type ApplicationHistoryContext,
  type UndoableCommand,
  type UndoRedoResult,
  type UndoRedoStackEntry,
} from "../history";
import {
  createBudgetAssignmentChangesCommand,
  createCollapsedBudgetAssignmentMovementCommand,
  isBudgetAssignmentHistoryEntry,
  type BudgetAssignmentChangesCommandInput,
  type BudgetAssignmentHistoryEntry,
} from "./budgetAssignmentEditing";
import {
  createBudgetViewMoneyMovementContext,
  createMoveBudgetMoneyCommand,
  createMoveBudgetMoneyFromMultipleSourcesCommand,
  type BudgetMoneyMovementContext,
  type MoveBudgetMoneyCommandInput,
  type MoveBudgetMoneyFromMultipleSourcesCommandInput,
} from "./budgetMoneyMovement";
import { normaliseMoney } from "./moneyMath";

function balancedAssignmentTail(
  stack: readonly UndoRedoStackEntry[],
): {
  readonly commandIds: readonly string[];
  readonly historyEntries: readonly BudgetAssignmentHistoryEntry[];
} | null {
  if (stack.length === 0) {
    return null;
  }

  const contiguous: Array<{
    commandId: string;
    historyEntry: BudgetAssignmentHistoryEntry;
  }> = [];
  let month: string | null = null;

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const stackEntry = stack[index]!;
    const historyEntry = stackEntry.historyEntry;
    if (!historyEntry || !isBudgetAssignmentHistoryEntry(historyEntry)) {
      break;
    }

    if (month === null) {
      month = historyEntry.payload.month;
    } else if (historyEntry.payload.month !== month) {
      break;
    }

    contiguous.unshift({
      commandId: stackEntry.id,
      historyEntry,
    });
  }

  for (let start = contiguous.length - 1; start >= 0; start -= 1) {
    let runningDelta = 0;
    let hasIncrease = false;
    let hasDecrease = false;
    let invalid = false;

    for (let index = start; index < contiguous.length; index += 1) {
      let entryDelta = 0;
      for (const change of contiguous[index]!.historyEntry.payload.changes) {
        const delta = normaliseMoney(
          change.finalAssigned - change.originalAssigned,
        );
        entryDelta = normaliseMoney(entryDelta + delta);
        hasIncrease ||= delta > 0;
        hasDecrease ||= delta < 0;
      }

      const nextRunningDelta = normaliseMoney(runningDelta + entryDelta);
      if (
        runningDelta !== 0 &&
        nextRunningDelta !== 0 &&
        Math.sign(runningDelta) !== Math.sign(nextRunningDelta)
      ) {
        invalid = true;
        break;
      }

      runningDelta = nextRunningDelta;
    }

    if (!invalid && runningDelta === 0 && hasIncrease && hasDecrease) {
      const tail = contiguous.slice(start);
      return {
        commandIds: tail.map((entry) => entry.commandId),
        historyEntries: tail.map((entry) => entry.historyEntry),
      };
    }
  }

  return null;
}

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
    get historyEntry() { return command.historyEntry ?? null; },
    execute: (context) => command.execute(contextFor(context)),
    undo: (context) => command.undo(contextFor(context)),
    redo: command.redo
      ? (context) => command.redo?.(contextFor(context))
      : undefined,
  };
}

export async function executeApplicationBudgetAssignmentChanges(
  budgetId: string,
  input: BudgetAssignmentChangesCommandInput,
): Promise<UndoRedoResult> {
  const result = await applicationHistory.execute(
    budgetId,
    adaptBudgetCommandToApplicationHistory(createBudgetAssignmentChangesCommand(input)),
  );

  if (!result.performed) {
    return result;
  }

  const balancedTail = balancedAssignmentTail(
    applicationHistory.getUndoStackEntries(budgetId),
  );
  if (!balancedTail) {
    return result;
  }

  applicationHistory.replaceUndoTail(
    budgetId,
    balancedTail.commandIds,
    adaptBudgetCommandToApplicationHistory(
      createCollapsedBudgetAssignmentMovementCommand(
        balancedTail.historyEntries,
      ),
    ),
  );

  return result;
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
