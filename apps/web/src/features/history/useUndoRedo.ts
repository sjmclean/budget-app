import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  createUndoRedoController,
  type UndoableCommand,
  type UndoRedoController,
  type UndoRedoResult,
  type UndoRedoSnapshot,
} from "./undoRedo";

export interface UseUndoRedoOptions {
  maxHistoryLength?: number;
}

export interface UseUndoRedoState<TContext> extends UndoRedoSnapshot {
  execute: (command: UndoableCommand<TContext>) => Promise<UndoRedoResult>;
  undo: () => Promise<UndoRedoResult>;
  redo: () => Promise<UndoRedoResult>;
  clear: () => UndoRedoResult;
  controller: UndoRedoController<TContext>;
}

export function useUndoRedo<TContext>(
  context: TContext,
  options: UseUndoRedoOptions = {},
): UseUndoRedoState<TContext> {
  const contextRef = useRef(context);
  contextRef.current = context;

  const controllerRef = useRef<UndoRedoController<TContext> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createUndoRedoController<TContext>({
      getContext: () => contextRef.current,
      maxHistoryLength: options.maxHistoryLength,
    });
  }

  const controller = controllerRef.current;

  useEffect(() => {
    if (options.maxHistoryLength !== undefined) {
      controller.setMaxHistoryLength(options.maxHistoryLength);
    }
  }, [controller, options.maxHistoryLength]);

  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const getSnapshot = useCallback(
    () => controller.getSnapshot(),
    [controller],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const execute = useCallback(
    (command: UndoableCommand<TContext>) => controller.execute(command),
    [controller],
  );
  const undo = useCallback(() => controller.undo(), [controller]);
  const redo = useCallback(() => controller.redo(), [controller]);
  const clear = useCallback(() => controller.clear(), [controller]);

  return {
    ...snapshot,
    execute,
    undo,
    redo,
    clear,
    controller,
  };
}
