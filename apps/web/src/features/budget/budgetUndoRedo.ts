import { useCallback, useSyncExternalStore } from "react";
import {
  createUndoRedoController,
  type UndoRedoResult,
  type UndoRedoSnapshot,
} from "../history";
import {
  moveBudgetMoneyWithUndo,
  type BudgetMoneyMovementContext,
  type MoveBudgetMoneyCommandInput,
} from "./budgetMoneyMovement";
import {
  executeBudgetAssignmentChangesWithUndo,
  type BudgetAssignmentChangesCommandInput,
} from "./budgetAssignmentEditing";

interface BudgetUndoRedoOwner {
  key: string;
  context: BudgetMoneyMovementContext;
  flushPending?: () => void | Promise<void>;
}

let owner: BudgetUndoRedoOwner | null = null;

const controller = createUndoRedoController<BudgetMoneyMovementContext>({
  getContext: () => {
    if (!owner) {
      throw new Error("No active Budget workspace is available for Undo/Redo.");
    }

    return owner.context;
  },
});

const EMPTY_SNAPSHOT: UndoRedoSnapshot = {
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  undoDepth: 0,
  redoDepth: 0,
  isBusy: false,
};

export function registerBudgetUndoRedoContext(
  key: string,
  context: BudgetMoneyMovementContext,
  options: { flushPending?: () => void | Promise<void> } = {},
): () => void {
  if (owner?.key !== key) {
    controller.clear();
  }

  owner = { key, context, flushPending: options.flushPending };

  return () => {
    if (owner?.key === key) {
      owner = null;
      controller.clear();
    }
  };
}

export function executeUndoableBudgetMoneyMovement(
  input: MoveBudgetMoneyCommandInput,
): Promise<UndoRedoResult> {
  return moveBudgetMoneyWithUndo(controller, input);
}

export function executeUndoableBudgetAssignmentChanges(
  input: BudgetAssignmentChangesCommandInput,
): Promise<UndoRedoResult> {
  return executeBudgetAssignmentChangesWithUndo(controller, input);
}

async function flushPendingBudgetEdits(): Promise<void> {
  await owner?.flushPending?.();
}

export async function undoBudgetAction(): Promise<UndoRedoResult> {
  await flushPendingBudgetEdits();
  return controller.undo();
}

export async function redoBudgetAction(): Promise<UndoRedoResult> {
  await flushPendingBudgetEdits();
  return controller.redo();
}

export function clearBudgetUndoRedoHistory(): UndoRedoResult {
  return controller.clear();
}

export function getBudgetUndoRedoSnapshot(): UndoRedoSnapshot {
  return owner ? controller.getSnapshot() : EMPTY_SNAPSHOT;
}

export function subscribeBudgetUndoRedo(listener: () => void): () => void {
  return controller.subscribe(listener);
}

export interface UseBudgetUndoRedoState extends UndoRedoSnapshot {
  undo: () => Promise<UndoRedoResult>;
  redo: () => Promise<UndoRedoResult>;
}

export function useBudgetUndoRedo(): UseBudgetUndoRedoState {
  const snapshot = useSyncExternalStore(
    subscribeBudgetUndoRedo,
    getBudgetUndoRedoSnapshot,
    getBudgetUndoRedoSnapshot,
  );
  const undo = useCallback(() => undoBudgetAction(), []);
  const redo = useCallback(() => redoBudgetAction(), []);

  return {
    ...snapshot,
    undo,
    redo,
  };
}
