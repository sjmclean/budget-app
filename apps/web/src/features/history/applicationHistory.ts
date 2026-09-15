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

export type ApplicationHistoryActionListener = (result: UndoRedoResult) => void;

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
  private readonly pendingFlushes = new Map<string, Set<() => void | Promise<void>>>();
  private readonly actionListeners = new Map<string, Set<ApplicationHistoryActionListener>>();
  private readonly getContext: (budgetId: string) => TContext;
  private readonly maxHistoryLength?: number;

  constructor(options: ApplicationHistoryServiceOptions<TContext>) {
    this.getContext = options.getContext;
    this.maxHistoryLength = options.maxHistoryLength;
  }

  async execute(
    budgetId: string,
    command: UndoableCommand<TContext>,
  ): Promise<UndoRedoResult> {
    const key = requireBudgetId(budgetId);
    const result = await this.controllerFor(key).execute(command);
    this.emitAction(key, result);
    return result;
  }

  async undo(budgetId: string): Promise<UndoRedoResult> {
    const key = requireBudgetId(budgetId);
    await this.flushPending(key);
    const result = await this.controllerFor(key).undo();
    this.emitAction(key, result);
    return result;
  }

  async redo(budgetId: string): Promise<UndoRedoResult> {
    const key = requireBudgetId(budgetId);
    await this.flushPending(key);
    const result = await this.controllerFor(key).redo();
    this.emitAction(key, result);
    return result;
  }

  clear(budgetId: string): UndoRedoResult {
    const key = requireBudgetId(budgetId);
    const controller = this.controllers.get(key);
    const result = controller ? controller.clear() : emptyClearResult();
    this.emitAction(key, result);
    return result;
  }

  destroy(budgetId: string): void {
    const key = requireBudgetId(budgetId);
    this.controllers.delete(key);
    this.pendingFlushes.delete(key);
    this.actionListeners.delete(key);
  }

  registerPendingEditFlush(
    budgetId: string,
    flush: () => void | Promise<void>,
  ): () => void {
    const key = requireBudgetId(budgetId);
    let flushes = this.pendingFlushes.get(key);
    if (!flushes) {
      flushes = new Set();
      this.pendingFlushes.set(key, flushes);
    }
    flushes.add(flush);
    return () => {
      flushes?.delete(flush);
      if (flushes?.size === 0) this.pendingFlushes.delete(key);
    };
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

  subscribeToActions(
    budgetId: string | null | undefined,
    listener: ApplicationHistoryActionListener,
  ): () => void {
    if (!budgetId?.trim()) {
      return () => undefined;
    }
    const key = requireBudgetId(budgetId);
    let listeners = this.actionListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.actionListeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) this.actionListeners.delete(key);
    };
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

  private emitAction(budgetId: string, result: UndoRedoResult): void {
    for (const listener of this.actionListeners.get(budgetId) ?? []) {
      listener(result);
    }
  }

  private async flushPending(budgetId: string): Promise<void> {
    const flushes = Array.from(this.pendingFlushes.get(budgetId) ?? []);
    for (const flush of flushes) await flush();
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
