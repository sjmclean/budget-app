import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  adaptBudgetCommandToApplicationHistory,
} from "../../../apps/web/src/features/budget/budgetApplicationHistory.ts";
import { createBudgetAssignmentChangesCommand } from "../../../apps/web/src/features/budget/budgetAssignmentEditing.ts";
import {
  applyCategoryAssignedValues,
  createMoveBudgetMoneyCommand,
  createMoveBudgetMoneyFromMultipleSourcesCommand,
} from "../../../apps/web/src/features/budget/budgetMoneyMovement.ts";
import type { BudgetMonthView } from "../../../apps/web/src/features/budget/budgetViewTypes.ts";
import {
  ApplicationHistoryService,
  type ApplicationHistoryContext,
} from "../../../apps/web/src/features/history/applicationHistory.ts";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.ts";

function initialView(): BudgetMonthView {
  const category = (id: string, name: string, assigned: number) => ({
    id, name, previousAvailable: 0, assigned, activity: 0, available: assigned,
    isOverspent: false, isArchived: false, note: "",
  });
  return {
    month: "2026-08", currencyCode: "AUD", readyToAssign: 0,
    totalAssigned: 100, totalActivity: 0, totalAvailable: 100,
    previousOverspending: 0,
    categoryGroups: [{
      id: "group", name: "Everyday", previousAvailable: 0, assigned: 100,
      activity: 0, available: 100, note: "",
      categories: [category("groceries", "Groceries", 60), category("fuel", "Fuel", 40), category("dining", "Dining", 0)],
    }],
  };
}

function harness() {
  let current = initialView();
  let writes = 0;
  const budgetView = {
    getBudgetMonthView: async () => current,
    setCategoryAssignedValues: async (input: { assignments: { categoryId: string; assigned: number }[] }) => {
      writes += 1;
      current = applyCategoryAssignedValues(current, input.assignments);
      return current;
    },
  };
  const service = new ApplicationHistoryService<ApplicationHistoryContext>({
    getContext: (budgetId) => ({
      budgetId,
      persistence: { budgetView } as unknown as BudgetPersistenceProvider,
    }),
  });
  return { service, current: () => current, writes: () => writes };
}

test("assignment persists and remains undoable after the Budget consumer disappears", async () => {
  const { service, current, writes } = harness();
  await service.execute("budget-a", adaptBudgetCommandToApplicationHistory(
    createBudgetAssignmentChangesCommand({ month: "2026-08", changes: [{
      categoryId: "groceries", categoryName: "Groceries", originalAssigned: 60, finalAssigned: 50,
    }] }),
  ));
  assert.equal(current().categoryGroups[0].categories[0].assigned, 50);
  assert.equal(service.getSnapshot("budget-a").undoLabel, "Change Groceries assignment");

  // There is no mounted-page context in the harness; Undo resolves the service context again.
  await service.undo("budget-a");
  assert.equal(current().categoryGroups[0].categories[0].assigned, 60);
  await service.redo("budget-a");
  assert.equal(current().categoryGroups[0].categories[0].assigned, 50);
  assert.equal(writes(), 3);
});

test("single and multi-source movements are persistent one-entry commands", async () => {
  const { service, current } = harness();
  await service.execute("budget-a", adaptBudgetCommandToApplicationHistory(
    createMoveBudgetMoneyCommand({
      month: "2026-08", sourceCategoryId: "groceries", destinationCategoryId: "dining", amount: 10,
    }),
  ));
  assert.equal(service.getSnapshot("budget-a").undoDepth, 1);

  await service.execute("budget-a", adaptBudgetCommandToApplicationHistory(
    createMoveBudgetMoneyFromMultipleSourcesCommand({
      month: "2026-08", destinationCategoryId: "dining",
      sources: [{ categoryId: "groceries", amount: 5 }, { categoryId: "fuel", amount: 5 }],
    }),
  ));
  assert.equal(service.getSnapshot("budget-a").undoDepth, 2);
  assert.match(service.getSnapshot("budget-a").undoLabel ?? "", /from 2 categories to Dining/);
  await service.undo("budget-a");
  assert.equal(current().categoryGroups[0].categories.find(({ id }) => id === "dining")?.assigned, 10);
  await service.execute("budget-a", adaptBudgetCommandToApplicationHistory(
    createMoveBudgetMoneyCommand({
      month: "2026-08", sourceCategoryId: "fuel", destinationCategoryId: "dining", amount: 1,
    }),
  ));
  assert.equal(service.getSnapshot("budget-a").redoDepth, 0);
});

test("Budget and Register source wiring observes the same application history hook", () => {
  const root = new URL("../../../apps/web/src/", import.meta.url);
  for (const file of ["pages/BudgetPage.tsx", "pages/AccountRegisterPage.tsx"]) {
    const source = readFileSync(new URL(file, root), "utf8");
    assert.match(source, /useApplicationHistory\(\)/);
    assert.doesNotMatch(source, /useBudgetUndoRedo|budgetUndoRedo/);
  }
  const workspaceSource = readFileSync(
    new URL("features/budget/useBudgetWorkspace.ts", root),
    "utf8",
  );
  assert.match(
    workspaceSource,
    /pendingChanges\.length > 0[\s\S]*executeApplicationBudgetAssignmentChanges\(budgetId, \{[\s\S]*changes: pendingChanges/,
  );
  assert.doesNotMatch(
    workspaceSource,
    /pendingChanges\.length > 0[\s\S]{0,500}setCategoryAssignedValues/,
  );
  assert.equal(existsSync(new URL("features/budget/budgetUndoRedo.ts", root)), false);
});
