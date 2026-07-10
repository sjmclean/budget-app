export interface UndoableCommand<TContext> {
  id: string;
  label: string;
  execute(context: TContext): void | Promise<void>;
  undo(context: TContext): void | Promise<void>;
  redo?(context: TContext): void | Promise<void>;
}

export type UndoRedoAction = "execute" | "undo" | "redo" | "clear";
export type UndoRedoFailureReason = "empty" | "busy" | "failed";

export type UndoRedoResult =
  | {
      performed: true;
      action: "execute" | "undo" | "redo";
      commandId: string;
      label: string;
    }
  | {
      performed: true;
      action: "clear";
      commandId: null;
      label: "Clear history";
      clearedUndoDepth: number;
      clearedRedoDepth: number;
    }
  | {
      performed: false;
      action: UndoRedoAction;
      reason: UndoRedoFailureReason;
      commandId?: string;
      label?: string;
      error?: string;
    };

export interface UndoRedoSnapshot {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undoDepth: number;
  redoDepth: number;
  isBusy: boolean;
}

export interface UndoRedoControllerOptions<TContext> {
  context?: TContext;
  getContext?: () => TContext;
  maxHistoryLength?: number;
}

export type UndoRedoListener = () => void;

const DEFAULT_MAX_HISTORY_LENGTH = 100;

function normaliseMaxHistoryLength(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MAX_HISTORY_LENGTH;
  }

  return Math.max(1, Math.floor(value));
}

function commandLabel<TContext>(command: UndoableCommand<TContext>): string {
  return command.label.trim() || "Untitled command";
}

function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "Undo/redo command failed.";
}

export class UndoRedoController<TContext = void> {
  private readonly undoStack: Array<UndoableCommand<TContext>> = [];
  private readonly redoStack: Array<UndoableCommand<TContext>> = [];
  private readonly listeners = new Set<UndoRedoListener>();
  private readonly getContext?: () => TContext;
  private readonly initialContext?: TContext;
  private maxHistoryLength: number;
  private busy = false;
  private snapshot: UndoRedoSnapshot;

  constructor(options: UndoRedoControllerOptions<TContext> = {}) {
    this.getContext = options.getContext;
    this.initialContext = options.context;
    this.maxHistoryLength = normaliseMaxHistoryLength(options.maxHistoryLength);
    this.snapshot = this.createSnapshot();
  }

  getSnapshot = (): UndoRedoSnapshot => this.snapshot;

  subscribe = (listener: UndoRedoListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setMaxHistoryLength(maxHistoryLength: number): void {
    this.maxHistoryLength = normaliseMaxHistoryLength(maxHistoryLength);
    this.trimUndoStack();
    this.emit();
  }

  execute = async (command: UndoableCommand<TContext>): Promise<UndoRedoResult> => {
    const blocked = this.begin("execute");
    if (blocked) {
      return blocked;
    }

    try {
      await command.execute(this.resolveContext());
      this.undoStack.push(command);
      this.trimUndoStack();
      this.redoStack.length = 0;

      return {
        performed: true,
        action: "execute",
        commandId: command.id,
        label: commandLabel(command),
      };
    } catch (error) {
      return {
        performed: false,
        action: "execute",
        reason: "failed",
        commandId: command.id,
        label: commandLabel(command),
        error: errorToString(error),
      };
    } finally {
      this.end();
    }
  };

  undo = async (): Promise<UndoRedoResult> => {
    if (this.busy) {
      return this.busyResult("undo");
    }

    const command = this.undoStack[this.undoStack.length - 1];
    if (!command) {
      return {
        performed: false,
        action: "undo",
        reason: "empty",
      };
    }

    const blocked = this.begin("undo");
    if (blocked) {
      return blocked;
    }

    try {
      await command.undo(this.resolveContext());
      this.undoStack.pop();
      this.redoStack.push(command);

      return {
        performed: true,
        action: "undo",
        commandId: command.id,
        label: commandLabel(command),
      };
    } catch (error) {
      return {
        performed: false,
        action: "undo",
        reason: "failed",
        commandId: command.id,
        label: commandLabel(command),
        error: errorToString(error),
      };
    } finally {
      this.end();
    }
  };

  redo = async (): Promise<UndoRedoResult> => {
    if (this.busy) {
      return this.busyResult("redo");
    }

    const command = this.redoStack[this.redoStack.length - 1];
    if (!command) {
      return {
        performed: false,
        action: "redo",
        reason: "empty",
      };
    }

    const blocked = this.begin("redo");
    if (blocked) {
      return blocked;
    }

    try {
      if (command.redo) {
        await command.redo(this.resolveContext());
      } else {
        await command.execute(this.resolveContext());
      }
      this.redoStack.pop();
      this.undoStack.push(command);

      return {
        performed: true,
        action: "redo",
        commandId: command.id,
        label: commandLabel(command),
      };
    } catch (error) {
      return {
        performed: false,
        action: "redo",
        reason: "failed",
        commandId: command.id,
        label: commandLabel(command),
        error: errorToString(error),
      };
    } finally {
      this.end();
    }
  };

  clear = (): UndoRedoResult => {
    if (this.busy) {
      return {
        performed: false,
        action: "clear",
        reason: "busy",
      };
    }

    const clearedUndoDepth = this.undoStack.length;
    const clearedRedoDepth = this.redoStack.length;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.emit();

    return {
      performed: true,
      action: "clear",
      commandId: null,
      label: "Clear history",
      clearedUndoDepth,
      clearedRedoDepth,
    };
  };

  clearHistory = this.clear;

  private begin(action: UndoRedoAction): UndoRedoResult | null {
    if (this.busy) {
      return this.busyResult(action);
    }

    this.busy = true;
    this.emit();
    return null;
  }

  private end(): void {
    this.busy = false;
    this.emit();
  }

  private busyResult(action: UndoRedoAction): UndoRedoResult {
    return {
      performed: false,
      action,
      reason: "busy",
    };
  }

  private resolveContext(): TContext {
    if (this.getContext) {
      return this.getContext();
    }

    return this.initialContext as TContext;
  }

  private trimUndoStack(): void {
    const overflow = this.undoStack.length - this.maxHistoryLength;
    if (overflow > 0) {
      this.undoStack.splice(0, overflow);
    }
  }

  private emit(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private createSnapshot(): UndoRedoSnapshot {
    const undoCommand = this.undoStack[this.undoStack.length - 1] ?? null;
    const redoCommand = this.redoStack[this.redoStack.length - 1] ?? null;

    return {
      canUndo: Boolean(undoCommand),
      canRedo: Boolean(redoCommand),
      undoLabel: undoCommand ? commandLabel(undoCommand) : null,
      redoLabel: redoCommand ? commandLabel(redoCommand) : null,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
      isBusy: this.busy,
    };
  }
}

export function createUndoRedoController<TContext = void>(
  options: UndoRedoControllerOptions<TContext> = {},
): UndoRedoController<TContext> {
  return new UndoRedoController(options);
}

export type UndoRedoKeyboardAction = "undo" | "redo";
export type UndoRedoKeyboardPlatform = "mac" | "windows" | "linux" | "other";

export interface UndoRedoKeyboardEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: unknown;
  preventDefault?: () => void;
}

export interface UndoRedoKeyboardShortcutOptions {
  allowEditableTarget?: boolean;
  platform?: UndoRedoKeyboardPlatform;
}

export interface UndoRedoKeyboardActions {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

function detectPlatform(): UndoRedoKeyboardPlatform {
  const platform = globalThis.navigator?.platform?.toLowerCase() ?? "";

  if (platform.includes("mac") || platform.includes("iphone") || platform.includes("ipad")) {
    return "mac";
  }

  if (platform.includes("win")) {
    return "windows";
  }

  if (platform.includes("linux")) {
    return "linux";
  }

  return "other";
}

export function isEditableUndoRedoTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const candidate = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    getAttribute?: (name: string) => string | null;
    closest?: (selector: string) => unknown;
  };
  const tagName = typeof candidate.tagName === "string" ? candidate.tagName.toUpperCase() : "";

  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  if (candidate.isContentEditable === true) {
    return true;
  }

  const contentEditable = candidate.getAttribute?.("contenteditable")?.toLowerCase();
  if (contentEditable === "" || contentEditable === "true" || contentEditable === "plaintext-only") {
    return true;
  }

  try {
    return Boolean(candidate.closest?.(
      "input, textarea, select, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']",
    ));
  } catch {
    return false;
  }
}

export function resolveUndoRedoKeyboardShortcut(
  event: UndoRedoKeyboardEventLike,
  options: UndoRedoKeyboardShortcutOptions = {},
): UndoRedoKeyboardAction | null {
  if (!options.allowEditableTarget && isEditableUndoRedoTarget(event.target)) {
    return null;
  }

  if (event.altKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  const hasCommandModifier = Boolean(event.ctrlKey || event.metaKey);

  if (!hasCommandModifier) {
    return null;
  }

  if (key === "z") {
    return event.shiftKey ? "redo" : "undo";
  }

  const platform = options.platform ?? detectPlatform();
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey && platform !== "mac") {
    return "redo";
  }

  return null;
}

export function createUndoRedoKeyboardHandler(
  actions: UndoRedoKeyboardActions,
  options: UndoRedoKeyboardShortcutOptions = {},
): (event: UndoRedoKeyboardEventLike) => void {
  return (event) => {
    const action = resolveUndoRedoKeyboardShortcut(event, options);

    if (!action) {
      return;
    }

    event.preventDefault?.();
    void actions[action]();
  };
}
