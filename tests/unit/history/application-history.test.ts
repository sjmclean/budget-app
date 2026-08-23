import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationHistoryService } from "../../../apps/web/src/features/history/applicationHistory.ts";
import type { UndoableCommand } from "../../../apps/web/src/features/history/undoRedo.ts";

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
