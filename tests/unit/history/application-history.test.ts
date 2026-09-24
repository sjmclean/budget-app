import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationHistoryService } from "../../../apps/web/src/features/history/applicationHistory.ts";
import type { UndoableCommand, UndoRedoResult } from "../../../apps/web/src/features/history/undoRedo.ts";

interface TestContext {
  budgetId: string;
  values: Map<string, number>;
}

function command(id: string, amount: number): UndoableCommand<TestContext> {
  return {
    id,
    label: `Change ${id}`,
    execute(context) {
      context.values.set(id, amount);
    },
    undo(context) {
      context.values.delete(id);
    },
  };
}

function createHarness(maxHistoryLength?: number) {
  const valuesByBudget = new Map<string, Map<string, number>>();
  const service = new ApplicationHistoryService<TestContext>({
    maxHistoryLength,
    getContext(budgetId) {
      let values = valuesByBudget.get(budgetId);
      if (!values) {
        values = new Map();
        valuesByBudget.set(budgetId, values);
      }
      return { budgetId, values };
    },
  });
  return { service, valuesByBudget };
}

test("keeps independent history stacks for each budget", async () => {
  const { service, valuesByBudget } = createHarness();
  await service.execute("budget-a", command("a", 1));
  await service.execute("budget-b", command("b", 2));

  assert.equal(service.getSnapshot("budget-a").undoLabel, "Change a");
  assert.equal(service.getSnapshot("budget-b").undoLabel, "Change b");
  await service.undo("budget-a");
  assert.equal(valuesByBudget.get("budget-a")?.has("a"), false);
  assert.equal(valuesByBudget.get("budget-b")?.get("b"), 2);
  assert.equal(service.getSnapshot("budget-b").undoDepth, 1);
});

test("history survives consumers unsubscribing and resubscribing", async () => {
  const { service } = createHarness();
  const unsubscribe = service.subscribe("budget-a", () => undefined);
  await service.execute("budget-a", command("a", 1));
  unsubscribe();

  const secondUnsubscribe = service.subscribe("budget-a", () => undefined);
  assert.equal(service.getSnapshot("budget-a").undoDepth, 1);
  secondUnsubscribe();
});

test("notifies action subscribers after successful execute, undo, and redo", async () => {
  const { service } = createHarness();
  const results: UndoRedoResult[] = [];
  const unsubscribe = service.subscribeToActions("budget-a", (result) => results.push(result));

  await service.execute("budget-a", command("a", 1));
  await service.undo("budget-a");
  await service.redo("budget-a");
  unsubscribe();

  assert.deepEqual(
    results.map((result) => ({ performed: result.performed, action: result.action, label: result.label })),
    [
      { performed: true, action: "execute", label: "Change a" },
      { performed: true, action: "undo", label: "Change a" },
      { performed: true, action: "redo", label: "Change a" },
    ],
  );
});

test("action subscriptions remain budget scoped and can unsubscribe", async () => {
  const { service } = createHarness();
  const actions: string[] = [];
  const unsubscribe = service.subscribeToActions("budget-a", (result) => actions.push(result.action));

  await service.execute("budget-b", command("b", 2));
  await service.execute("budget-a", command("a", 1));
  unsubscribe();
  await service.undo("budget-a");

  assert.deepEqual(actions, ["execute"]);
});

test("new execution clears redo and history remains bounded", async () => {
  const { service } = createHarness(2);
  await service.execute("budget-a", command("a", 1));
  await service.execute("budget-a", command("b", 2));
  await service.execute("budget-a", command("c", 3));
  assert.equal(service.getSnapshot("budget-a").undoDepth, 2);

  await service.undo("budget-a");
  assert.equal(service.getSnapshot("budget-a").redoDepth, 1);
  await service.execute("budget-a", command("d", 4));
  assert.equal(service.getSnapshot("budget-a").redoDepth, 0);
});

test("can replace an already-executed adjacent tail with one atomic undo command", async () => {
  const { service, valuesByBudget } = createHarness();
  await service.execute("budget-a", command("a", 1));
  await service.execute("budget-a", command("b", 2));

  const replaced = service.replaceUndoTail(
    "budget-a",
    ["a", "b"],
    {
      id: "ab",
      label: "Change a and b",
      execute(context) {
        context.values.set("a", 1);
        context.values.set("b", 2);
      },
      undo(context) {
        context.values.delete("a");
        context.values.delete("b");
      },
      redo(context) {
        context.values.set("a", 1);
        context.values.set("b", 2);
      },
    },
  );

  assert.equal(replaced, true);
  assert.equal(service.getSnapshot("budget-a").undoDepth, 1);
  assert.equal(service.getSnapshot("budget-a").undoLabel, "Change a and b");

  await service.undo("budget-a");
  assert.equal(valuesByBudget.get("budget-a")?.has("a"), false);
  assert.equal(valuesByBudget.get("budget-a")?.has("b"), false);

  await service.redo("budget-a");
  assert.equal(valuesByBudget.get("budget-a")?.get("a"), 1);
  assert.equal(valuesByBudget.get("budget-a")?.get("b"), 2);
});

test("undo-tail replacement fails closed when the requested commands are not the exact suffix", async () => {
  const { service } = createHarness();
  await service.execute("budget-a", command("a", 1));
  await service.execute("budget-a", command("b", 2));

  const replaced = service.replaceUndoTail(
    "budget-a",
    ["a"],
    command("replacement", 3),
  );

  assert.equal(replaced, false);
  assert.equal(service.getSnapshot("budget-a").undoDepth, 2);
  assert.equal(service.getSnapshot("budget-a").undoLabel, "Change b");
});

test("destroy removes a deleted budget's stack", async () => {
  const { service } = createHarness();
  await service.execute("budget-a", command("a", 1));
  service.destroy("budget-a");
  assert.equal(service.getSnapshot("budget-a").undoDepth, 0);
});

test("flushes pending editing-surface work before undo", async () => {
  const { service } = createHarness();
  const order: string[] = [];
  await service.execute("budget-a", {
    id: "edit",
    label: "Edit",
    execute() { order.push("execute"); },
    undo() { order.push("undo"); },
  });
  const unregister = service.registerPendingEditFlush("budget-a", () => {
    order.push("flush");
  });
  await service.undo("budget-a");
  unregister();
  assert.deepEqual(order, ["execute", "flush", "undo"]);
});
