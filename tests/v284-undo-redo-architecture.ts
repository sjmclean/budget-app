import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createUndoRedoController,
  createUndoRedoKeyboardHandler,
  resolveUndoRedoKeyboardShortcut,
  type UndoableCommand,
} from "../apps/web/src/features/history/index.js";

interface CounterContext {
  value: number;
}

interface SetCounterCommandOptions {
  executeThrows?: boolean;
  undoThrows?: boolean;
  redoThrows?: boolean;
  onExecute?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  withRedo?: boolean;
}

function createCounterContext(value = 0): CounterContext {
  return { value };
}

function createSetCounterCommand(
  id: string,
  label: string,
  nextValue: number,
  options: SetCounterCommandOptions = {},
): UndoableCommand<CounterContext> {
  let previousValue = 0;

  return {
    id,
    label,
    execute(context) {
      options.onExecute?.();
      if (options.executeThrows) {
        throw new Error(`${id} execute failed`);
      }

      previousValue = context.value;
      context.value = nextValue;
    },
    undo(context) {
      options.onUndo?.();
      if (options.undoThrows) {
        throw new Error(`${id} undo failed`);
      }

      context.value = previousValue;
    },
    ...(options.withRedo
      ? {
          redo(context: CounterContext) {
            options.onRedo?.();
            if (options.redoThrows) {
              throw new Error(`${id} redo failed`);
            }

            previousValue = context.value;
            context.value = nextValue;
          },
        }
      : {}),
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

async function testExecuteUndoRedoAndLabels(): Promise<void> {
  const context = createCounterContext();
  const controller = createUndoRedoController<CounterContext>({
    getContext: () => context,
    maxHistoryLength: 10,
  });

  const executeResult = await controller.execute(createSetCounterCommand("set-5", "Set counter to 5", 5));
  assert.deepEqual(executeResult, {
    performed: true,
    action: "execute",
    commandId: "set-5",
    label: "Set counter to 5",
  });
  assert.equal(context.value, 5);
  assert.equal(controller.getSnapshot().canUndo, true);
  assert.equal(controller.getSnapshot().canRedo, false);
  assert.equal(controller.getSnapshot().undoLabel, "Set counter to 5");
  assert.equal(controller.getSnapshot().redoLabel, null);
  assert.equal(controller.getSnapshot().undoDepth, 1);
  assert.equal(controller.getSnapshot().redoDepth, 0);

  const undoResult = await controller.undo();
  assert.equal(undoResult.performed, true);
  assert.equal(context.value, 0);
  assert.equal(controller.getSnapshot().canUndo, false);
  assert.equal(controller.getSnapshot().canRedo, true);
  assert.equal(controller.getSnapshot().undoDepth, 0);
  assert.equal(controller.getSnapshot().redoDepth, 1);
  assert.equal(controller.getSnapshot().redoLabel, "Set counter to 5");

  const redoResult = await controller.redo();
  assert.equal(redoResult.performed, true);
  assert.equal(context.value, 5);
  assert.equal(controller.getSnapshot().canUndo, true);
  assert.equal(controller.getSnapshot().canRedo, false);
}

async function testRedoDefaultsToExecute(): Promise<void> {
  const context = createCounterContext();
  const controller = createUndoRedoController<CounterContext>({ getContext: () => context });
  let executeCalls = 0;

  await controller.execute(createSetCounterCommand("default-redo", "Default redo", 7, {
    onExecute: () => {
      executeCalls += 1;
    },
  }));
  await controller.undo();
  await controller.redo();

  assert.equal(context.value, 7);
  assert.equal(executeCalls, 2, "redo should call execute when the command omits redo");
}

async function testNewExecutionClearsRedoHistory(): Promise<void> {
  const context = createCounterContext();
  const controller = createUndoRedoController<CounterContext>({ getContext: () => context });

  await controller.execute(createSetCounterCommand("first", "First change", 1));
  await controller.undo();
  assert.equal(controller.getSnapshot().canRedo, true);

  await controller.execute(createSetCounterCommand("second", "Second change", 2));
  assert.equal(context.value, 2);
  assert.equal(controller.getSnapshot().canRedo, false);
  assert.equal(controller.getSnapshot().redoDepth, 0);
}

async function testMaximumHistoryLimit(): Promise<void> {
  const context = createCounterContext();
  const controller = createUndoRedoController<CounterContext>({
    getContext: () => context,
    maxHistoryLength: 2,
  });

  await controller.execute(createSetCounterCommand("one", "One", 1));
  await controller.execute(createSetCounterCommand("two", "Two", 2));
  await controller.execute(createSetCounterCommand("three", "Three", 3));

  assert.equal(controller.getSnapshot().undoDepth, 2);
  assert.equal(controller.getSnapshot().undoLabel, "Three");

  await controller.undo();
  assert.equal(context.value, 2);
  await controller.undo();
  assert.equal(context.value, 1, "oldest command should have been discarded, leaving value after command one");
  assert.equal(controller.getSnapshot().canUndo, false);
}

async function testClearAndEmptyNoOps(): Promise<void> {
  const context = createCounterContext();
  const controller = createUndoRedoController<CounterContext>({ getContext: () => context });

  assert.deepEqual(await controller.undo(), { performed: false, action: "undo", reason: "empty" });
  assert.deepEqual(await controller.redo(), { performed: false, action: "redo", reason: "empty" });

  await controller.execute(createSetCounterCommand("one", "One", 1));
  await controller.execute(createSetCounterCommand("two", "Two", 2));
  await controller.undo();

  const clearResult = controller.clear();
  assert.equal(clearResult.performed, true);
  assert.equal(controller.getSnapshot().undoDepth, 0);
  assert.equal(controller.getSnapshot().redoDepth, 0);
  assert.equal(controller.getSnapshot().canUndo, false);
  assert.equal(controller.getSnapshot().canRedo, false);
}

async function testFailureSafety(): Promise<void> {
  const context = createCounterContext();
  const controller = createUndoRedoController<CounterContext>({ getContext: () => context });

  const failedExecute = await controller.execute(createSetCounterCommand("bad-execute", "Bad execute", 10, {
    executeThrows: true,
  }));
  assert.equal(failedExecute.performed, false);
  assert.equal(failedExecute.reason, "failed");
  assert.equal(context.value, 0);
  assert.equal(controller.getSnapshot().undoDepth, 0);

  await controller.execute(createSetCounterCommand("bad-undo", "Bad undo", 5, {
    undoThrows: true,
  }));
  const failedUndo = await controller.undo();
  assert.equal(failedUndo.performed, false);
  assert.equal(failedUndo.reason, "failed");
  assert.equal(context.value, 5);
  assert.equal(controller.getSnapshot().canUndo, true, "failed undo should remain available to undo");
  assert.equal(controller.getSnapshot().canRedo, false);

  controller.clear();
  context.value = 0;
  await controller.execute(createSetCounterCommand("bad-redo", "Bad redo", 6, {
    withRedo: true,
    redoThrows: true,
  }));
  await controller.undo();
  const failedRedo = await controller.redo();
  assert.equal(failedRedo.performed, false);
  assert.equal(failedRedo.reason, "failed");
  assert.equal(context.value, 0);
  assert.equal(controller.getSnapshot().canRedo, true, "failed redo should remain available to redo");
  assert.equal(controller.getSnapshot().canUndo, false);
}

async function testBusySequentialProtection(): Promise<void> {
  const context = createCounterContext();
  const controller = createUndoRedoController<CounterContext>({ getContext: () => context });
  const gate = deferred();

  const running = controller.execute({
    id: "slow",
    label: "Slow command",
    async execute(nextContext) {
      await gate.promise;
      nextContext.value = 1;
    },
    undo(nextContext) {
      nextContext.value = 0;
    },
  });

  assert.equal(controller.getSnapshot().isBusy, true);
  assert.deepEqual(await controller.execute(createSetCounterCommand("blocked", "Blocked", 2)), {
    performed: false,
    action: "execute",
    reason: "busy",
  });
  assert.deepEqual(await controller.undo(), { performed: false, action: "undo", reason: "busy" });
  assert.deepEqual(await controller.redo(), { performed: false, action: "redo", reason: "busy" });
  assert.deepEqual(controller.clear(), { performed: false, action: "clear", reason: "busy" });

  gate.resolve();
  const result = await running;
  assert.equal(result.performed, true);
  assert.equal(context.value, 1);
  assert.equal(controller.getSnapshot().isBusy, false);
}

function testSubscriptions(): void {
  const context = createCounterContext();
  const controller = createUndoRedoController<CounterContext>({ getContext: () => context });
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => {
    notifications += 1;
  });

  controller.clear();
  assert.equal(notifications, 1);
  unsubscribe();
  controller.clear();
  assert.equal(notifications, 1, "unsubscribe should stop future notifications");
}

function testKeyboardShortcutResolution(): void {
  assert.equal(resolveUndoRedoKeyboardShortcut({ key: "z", ctrlKey: true }, { platform: "windows" }), "undo");
  assert.equal(resolveUndoRedoKeyboardShortcut({ key: "Z", metaKey: true }, { platform: "mac" }), "undo");
  assert.equal(resolveUndoRedoKeyboardShortcut({ key: "z", ctrlKey: true, shiftKey: true }, { platform: "windows" }), "redo");
  assert.equal(resolveUndoRedoKeyboardShortcut({ key: "z", metaKey: true, shiftKey: true }, { platform: "mac" }), "redo");
  assert.equal(resolveUndoRedoKeyboardShortcut({ key: "y", ctrlKey: true }, { platform: "windows" }), "redo");
  assert.equal(resolveUndoRedoKeyboardShortcut({ key: "y", ctrlKey: true }, { platform: "linux" }), "redo");
  assert.equal(resolveUndoRedoKeyboardShortcut({ key: "y", ctrlKey: true }, { platform: "mac" }), null);
  assert.equal(resolveUndoRedoKeyboardShortcut({ key: "z", altKey: true, ctrlKey: true }, { platform: "windows" }), null);
  assert.equal(resolveUndoRedoKeyboardShortcut({ key: "z" }, { platform: "windows" }), null);
}

function testEditableTargetsAreIgnored(): void {
  assert.equal(
    resolveUndoRedoKeyboardShortcut({ key: "z", ctrlKey: true, target: { tagName: "INPUT" } }, { platform: "windows" }),
    null,
  );
  assert.equal(
    resolveUndoRedoKeyboardShortcut({ key: "z", metaKey: true, target: { tagName: "textarea" } }, { platform: "mac" }),
    null,
  );
  assert.equal(
    resolveUndoRedoKeyboardShortcut({ key: "z", ctrlKey: true, target: { tagName: "SELECT" } }, { platform: "linux" }),
    null,
  );
  assert.equal(
    resolveUndoRedoKeyboardShortcut({ key: "z", ctrlKey: true, target: { isContentEditable: true } }, { platform: "windows" }),
    null,
  );
  assert.equal(
    resolveUndoRedoKeyboardShortcut(
      { key: "z", ctrlKey: true, target: { tagName: "INPUT" } },
      { platform: "windows", allowEditableTarget: true },
    ),
    "undo",
  );
}

function testKeyboardHandler(): void {
  let prevented = false;
  let undoCalls = 0;
  let redoCalls = 0;
  const handler = createUndoRedoKeyboardHandler(
    {
      undo: () => {
        undoCalls += 1;
      },
      redo: () => {
        redoCalls += 1;
      },
    },
    { platform: "windows" },
  );

  handler({
    key: "z",
    ctrlKey: true,
    preventDefault: () => {
      prevented = true;
    },
  });
  handler({ key: "y", ctrlKey: true });

  assert.equal(prevented, true);
  assert.equal(undoCalls, 1);
  assert.equal(redoCalls, 1);
}

function testArchitectureFiles(): void {
  const undoRedo = readFileSync("apps/web/src/features/history/undoRedo.ts", "utf8");
  const useUndoRedo = readFileSync("apps/web/src/features/history/useUndoRedo.ts", "utf8");
  const index = readFileSync("apps/web/src/features/history/index.ts", "utf8");
  const docs = readFileSync("docs/architecture/undo-redo.md", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(undoRedo, /export interface UndoableCommand/);
  assert.match(undoRedo, /maxHistoryLength/);
  assert.match(undoRedo, /resolveUndoRedoKeyboardShortcut/);
  assert.doesNotMatch(undoRedo, /versionHistory|backup|localStorage|sessionStorage/i);
  assert.match(useUndoRedo, /useSyncExternalStore/);
  assert.match(index, /useUndoRedo/);
  assert.match(docs, /session-level, action-based/);
  assert.match(docs, /Version History is different/);
  assert.match(docs, /Backup packages are different/);
  assert.match(docs, /must not depend on the undo stack/);
  assert.equal(packageJson.scripts["test:v284"], "tsx tests/v284-undo-redo-architecture.ts");
}

await testExecuteUndoRedoAndLabels();
await testRedoDefaultsToExecute();
await testNewExecutionClearsRedoHistory();
await testMaximumHistoryLimit();
await testClearAndEmptyNoOps();
await testFailureSafety();
await testBusySequentialProtection();
testSubscriptions();
testKeyboardShortcutResolution();
testEditableTargetsAreIgnored();
testKeyboardHandler();
testArchitectureFiles();

console.log("v2.84 undo/redo architecture checks passed");
