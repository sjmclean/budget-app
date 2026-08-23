import { getBudgetPersistenceProvider } from "../persistence";
import type { BudgetPersistenceProvider } from "../persistence/budgetPersistenceProvider";
import {
  createUndoRedoController,
  type UndoableCommand,
  type UndoRedoController,
  type UndoRedoResult,
  type UndoRedoSnapshot,
} from "./undoRedo";

export interface ApplicationHistoryContext {
  readonly budgetId: string;
  readonly persistence: BudgetPersistenceProvider;
}

export interface ApplicationHistoryServiceOptions<TContext> {
  readonly getContext: (budgetId: string) => TContext;
  readonly maxHistoryLength?: number;
}

const EMPTY_SNAPSHOT: UndoRedoSnapshot = {
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  undoDepth: 0,
  redoDepth: 0,
  isBusy: false,
};

function requireBudgetId(budgetId: string): string {
  const normalised = budgetId.trim();
  if (!normalised) {
    throw new Error("Application history requires a budget id.");
  }
  return normalised;
}

export class ApplicationHistoryService<TContext> {
  private readonly controllers = new Map<string, UndoRedoController<TContext>>();
  private readonly getContext: (budgetId: string) => TContext;
  private readonly maxHistoryLength?: number;

  constructor(options: ApplicationHistoryServiceOptions<TContext>) {
    this.getContext = options.getContext;
    this.maxHistoryLength = options.maxHistoryLength;
  }

  execute(
    budgetId: string,
    command: UndoableCommand<TContext>,
  ): Promise<UndoRedoResult> {
    return this.controllerFor(budgetId).execute(command);
  }

  undo(budgetId: string): Promise<UndoRedoResult> {
    return this.controllerFor(budgetId).undo();
  }

  redo(budgetId: string): Promise<UndoRedoResult> {
    return this.controllerFor(budgetId).redo();
  }

  clear(budgetId: string): UndoRedoResult {
    const controller = this.controllers.get(requireBudgetId(budgetId));
    return controller ? controller.clear() : emptyClearResult();
  }

  destroy(budgetId: string): void {
    this.controllers.delete(requireBudgetId(budgetId));
  }

  getSnapshot(budgetId: string | null | undefined): UndoRedoSnapshot {
    if (!budgetId?.trim()) {
      return EMPTY_SNAPSHOT;
    }
    return this.controllers.get(budgetId.trim())?.getSnapshot() ?? EMPTY_SNAPSHOT;
  }

  subscribe(budgetId: string | null | undefined, listener: () => void): () => void {
    if (!budgetId?.trim()) {
      return () => undefined;
    }
    return this.controllerFor(budgetId).subscribe(listener);
  }

  private controllerFor(budgetId: string): UndoRedoController<TContext> {
    const key = requireBudgetId(budgetId);
    let controller = this.controllers.get(key);
    if (!controller) {
      controller = createUndoRedoController<TContext>({
        getContext: () => this.getContext(key),
        maxHistoryLength: this.maxHistoryLength,
      });
      this.controllers.set(key, controller);
    }
    return controller;
  }
}

function emptyClearResult(): UndoRedoResult {
  return {
    performed: true,
    action: "clear",
    commandId: null,
    label: "Clear history",
    clearedUndoDepth: 0,
    clearedRedoDepth: 0,
  };
}

export const applicationHistory = new ApplicationHistoryService<ApplicationHistoryContext>({
  getContext: (budgetId) => ({
    budgetId,
    persistence: getBudgetPersistenceProvider(),
  }),
});
