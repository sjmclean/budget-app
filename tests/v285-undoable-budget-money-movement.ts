import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createUndoRedoController,
  type UndoRedoResult,
} from "../apps/web/src/features/history/index.js";
import {
  applyCategoryAssignedValues,
  createMoveBudgetMoneyCommand,
  moveBudgetMoneyWithUndo,
  type BudgetCategoryAssignedValue,
  type BudgetMoneyMovementContext,
} from "../apps/web/src/features/budget/budgetMoneyMovement.js";
import type {
  BudgetCategoryGroupView,
  BudgetCategoryView,
  BudgetMonthView,
} from "../apps/web/src/features/budget/budgetViewTypes.js";
import { isMoneyNegative, normaliseMoney } from "../apps/web/src/features/budget/moneyMath.js";

const MONTH = "2026-06";

function cloneView(view: BudgetMonthView): BudgetMonthView {
  return JSON.parse(JSON.stringify(view)) as BudgetMonthView;
}

function createCategory(input: {
  id: string;
  name: string;
  assigned: number;
  activity?: number;
  previousAvailable?: number;
}): BudgetCategoryView {
  return {
    id: input.id,
    name: input.name,
    previousAvailable: input.previousAvailable ?? 0,
    assigned: input.assigned,
    activity: input.activity ?? 0,
    available: 0,
    isOverspent: false,
    isArchived: false,
    note: "",
  };
}

function createGroup(
  id: string,
  name: string,
  categories: BudgetCategoryView[],
): BudgetCategoryGroupView {
  return {
    id,
    name,
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    note: "",
    categories,
  };
}

function createBudgetView(overrides: {
  groceriesAssigned?: number;
  mortgageAssigned?: number;
  diningAssigned?: number;
} = {}): BudgetMonthView {
  return applyCategoryAssignedValues(
    {
      budgetId: "household",
      budgetName: "Household Budget",
      monthLabel: "June 2026",
      currencyCode: "USD",
      readyToAssign: 800,
      totalAssigned: 0,
      totalActivity: 0,
      totalAvailable: 0,
      categoryGroups: [
        createGroup("everyday", "Everyday", [
          createCategory({
            id: "groceries",
            name: "Groceries",
            assigned: overrides.groceriesAssigned ?? 1200,
            activity: -100,
            previousAvailable: 25,
          }),
          createCategory({
            id: "dining",
            name: "Dining Out",
            assigned: overrides.diningAssigned ?? 200,
            activity: -40,
          }),
        ]),
        createGroup("bills", "Bills", [
          createCategory({
            id: "mortgage",
            name: "Mortgage",
            assigned: overrides.mortgageAssigned ?? 300,
            activity: -25,
          }),
        ]),
      ],
    },
    [],
  );
}

class InMemoryBudgetMoneyMovementContext implements BudgetMoneyMovementContext {
  private readonly viewsByMonth = new Map<string, BudgetMonthView>();
  failNextSave = false;
  failOnAssignmentIndex: number | null = null;

  constructor(view = createBudgetView(), month = MONTH) {
    this.viewsByMonth.set(month, cloneView(view));
  }

  view(month = MONTH): BudgetMonthView {
    const view = this.viewsByMonth.get(month);

    if (!view) {
      throw new Error("Budget month was not found.");
    }

    return cloneView(view);
  }

  getBudgetMonthView(month: string): BudgetMonthView {
    return this.view(month);
  }

  setCategoryAssignedValues(input: {
    month: string;
    assignments: BudgetCategoryAssignedValue[];
  }): BudgetMonthView {
    const current = this.viewsByMonth.get(input.month);

    if (!current) {
      throw new Error("Budget month was not found.");
    }

    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("Simulated assignment save failure.");
    }

    if (this.failOnAssignmentIndex !== null) {
      const original = cloneView(current);
      let draft = cloneView(current);

      for (let index = 0; index < input.assignments.length; index += 1) {
        if (index === this.failOnAssignmentIndex) {
          this.failOnAssignmentIndex = null;
          this.viewsByMonth.set(input.month, original);
          throw new Error("Simulated second assignment failure.");
        }

        draft = applyCategoryAssignedValues(draft, [input.assignments[index]]);
      }

      this.failOnAssignmentIndex = null;
      this.viewsByMonth.set(input.month, draft);
      return cloneView(draft);
    }

    const next = applyCategoryAssignedValues(current, input.assignments);
    this.viewsByMonth.set(input.month, next);
    return cloneView(next);
  }
}

function findCategory(view: BudgetMonthView, categoryId: string): BudgetCategoryView {
  for (const group of view.categoryGroups) {
    const category = group.categories.find((item) => item.id === categoryId);

    if (category) {
      return category;
    }
  }

  throw new Error(`Category ${categoryId} was not found.`);
}

function assigned(context: InMemoryBudgetMoneyMovementContext, categoryId: string): number {
  return findCategory(context.view(), categoryId).assigned;
}

function totalAssigned(view: BudgetMonthView): number {
  return normaliseMoney(
    view.categoryGroups.reduce(
      (total, group) =>
        total +
        group.categories.reduce((groupTotal, category) => groupTotal + category.assigned, 0),
      0,
    ),
  );
}

function assertPerformed(result: UndoRedoResult): void {
  assert.equal(result.performed, true, JSON.stringify(result));
}

function assertFailed(result: UndoRedoResult): void {
  assert.equal(result.performed, false, JSON.stringify(result));
  assert.equal(result.reason, "failed");
}

function assertBudgetCalculations(view: BudgetMonthView): void {
  for (const group of view.categoryGroups) {
    for (const category of group.categories) {
      assert.equal(
        category.available,
        normaliseMoney(category.previousAvailable + category.assigned + category.activity),
        `${category.name} available should match previous + assigned + activity`,
      );
      assert.equal(category.isOverspent, isMoneyNegative(category.available));
    }

    assert.equal(
      group.previousAvailable,
      normaliseMoney(group.categories.reduce((total, category) => total + category.previousAvailable, 0)),
      `${group.name} previous available should be recalculated`,
    );
    assert.equal(
      group.assigned,
      normaliseMoney(group.categories.reduce((total, category) => total + category.assigned, 0)),
      `${group.name} assigned should be recalculated`,
    );
    assert.equal(
      group.activity,
      normaliseMoney(group.categories.reduce((total, category) => total + category.activity, 0)),
      `${group.name} activity should be recalculated`,
    );
    assert.equal(
      group.available,
      normaliseMoney(group.categories.reduce((total, category) => total + category.available, 0)),
      `${group.name} available should be recalculated`,
    );
  }

  assert.equal(view.totalAssigned, totalAssigned(view));
  assert.equal(
    view.totalActivity,
    normaliseMoney(view.categoryGroups.reduce((total, group) => total + group.activity, 0)),
  );
  assert.equal(
    view.totalAvailable,
    normaliseMoney(view.categoryGroups.reduce((total, group) => total + group.available, 0)),
  );
}

async function testMoveUndoRedoLabelsAndTotals(): Promise<void> {
  const context = new InMemoryBudgetMoneyMovementContext();
  const controller = createUndoRedoController<BudgetMoneyMovementContext>({
    getContext: () => context,
  });
  const originalTotal = context.view().totalAssigned;

  const executeResult = await moveBudgetMoneyWithUndo(controller, {
    month: MONTH,
    sourceCategoryId: "groceries",
    destinationCategoryId: "mortgage",
    amount: 500,
  });
  assertPerformed(executeResult);
  assert.equal(assigned(context, "groceries"), 700);
  assert.equal(assigned(context, "mortgage"), 800);
  assert.equal(context.view().totalAssigned, originalTotal);
  assert.equal(controller.getSnapshot().undoDepth, 1);
  assert.equal(controller.getSnapshot().redoDepth, 0);
  assert.equal(controller.getSnapshot().undoLabel, "Move $500.00 from Groceries to Mortgage");
  assert.equal(executeResult.label, "Move $500.00 from Groceries to Mortgage");
  assertBudgetCalculations(context.view());

  const undoResult = await controller.undo();
  assertPerformed(undoResult);
  assert.equal(assigned(context, "groceries"), 1200);
  assert.equal(assigned(context, "mortgage"), 300);
  assert.equal(controller.getSnapshot().redoLabel, "Move $500.00 from Groceries to Mortgage");
  assertBudgetCalculations(context.view());

  const redoResult = await controller.redo();
  assertPerformed(redoResult);
  assert.equal(assigned(context, "groceries"), 700);
  assert.equal(assigned(context, "mortgage"), 800);
  assert.equal(context.view().totalAssigned, originalTotal);
  assertBudgetCalculations(context.view());
}

async function testNewMovementAfterUndoClearsRedoHistory(): Promise<void> {
  const context = new InMemoryBudgetMoneyMovementContext();
  const controller = createUndoRedoController<BudgetMoneyMovementContext>({
    getContext: () => context,
  });

  await moveBudgetMoneyWithUndo(controller, {
    month: MONTH,
    sourceCategoryId: "groceries",
    destinationCategoryId: "mortgage",
    amount: 100,
  });
  await controller.undo();
  assert.equal(controller.getSnapshot().canRedo, true);

  await moveBudgetMoneyWithUndo(controller, {
    month: MONTH,
    sourceCategoryId: "dining",
    destinationCategoryId: "mortgage",
    amount: 25,
  });

  assert.equal(controller.getSnapshot().canRedo, false);
  assert.equal(controller.getSnapshot().redoDepth, 0);
}

async function testInvalidInputsAreRejected(): Promise<void> {
  const cases: Array<{
    name: string;
    input: Parameters<typeof createMoveBudgetMoneyCommand>[0];
  }> = [
    {
      name: "zero amount",
      input: {
        month: MONTH,
        sourceCategoryId: "groceries",
        destinationCategoryId: "mortgage",
        amount: 0,
      },
    },
    {
      name: "negative amount",
      input: {
        month: MONTH,
        sourceCategoryId: "groceries",
        destinationCategoryId: "mortgage",
        amount: -1,
      },
    },
    {
      name: "non-finite amount",
      input: {
        month: MONTH,
        sourceCategoryId: "groceries",
        destinationCategoryId: "mortgage",
        amount: Number.POSITIVE_INFINITY,
      },
    },
    {
      name: "same categories",
      input: {
        month: MONTH,
        sourceCategoryId: "groceries",
        destinationCategoryId: "groceries",
        amount: 1,
      },
    },
    {
      name: "invalid month",
      input: {
        month: "2026-13",
        sourceCategoryId: "groceries",
        destinationCategoryId: "mortgage",
        amount: 1,
      },
    },
    {
      name: "missing source",
      input: {
        month: MONTH,
        sourceCategoryId: "missing-source",
        destinationCategoryId: "mortgage",
        amount: 1,
      },
    },
    {
      name: "missing destination",
      input: {
        month: MONTH,
        sourceCategoryId: "groceries",
        destinationCategoryId: "missing-destination",
        amount: 1,
      },
    },
  ];

  for (const testCase of cases) {
    const context = new InMemoryBudgetMoneyMovementContext();
    const controller = createUndoRedoController<BudgetMoneyMovementContext>({
      getContext: () => context,
    });
    const result = await controller.execute(createMoveBudgetMoneyCommand(testCase.input));

    assertFailed(result);
    assert.equal(controller.getSnapshot().undoDepth, 0, `${testCase.name} should not enter history`);
    assert.equal(assigned(context, "groceries"), 1200, `${testCase.name} should not change source`);
    assert.equal(assigned(context, "mortgage"), 300, `${testCase.name} should not change destination`);
  }
}

async function testFailedExecutionDoesNotEnterHistory(): Promise<void> {
  const context = new InMemoryBudgetMoneyMovementContext();
  context.failNextSave = true;
  const controller = createUndoRedoController<BudgetMoneyMovementContext>({
    getContext: () => context,
  });

  const result = await moveBudgetMoneyWithUndo(controller, {
    month: MONTH,
    sourceCategoryId: "groceries",
    destinationCategoryId: "mortgage",
    amount: 500,
  });

  assertFailed(result);
  assert.equal(controller.getSnapshot().undoDepth, 0);
  assert.equal(assigned(context, "groceries"), 1200);
  assert.equal(assigned(context, "mortgage"), 300);
}

async function testPartialUpdatesRollbackIfSecondAssignmentFails(): Promise<void> {
  const context = new InMemoryBudgetMoneyMovementContext();
  context.failOnAssignmentIndex = 1;
  const controller = createUndoRedoController<BudgetMoneyMovementContext>({
    getContext: () => context,
  });

  const result = await moveBudgetMoneyWithUndo(controller, {
    month: MONTH,
    sourceCategoryId: "groceries",
    destinationCategoryId: "mortgage",
    amount: 500,
  });

  assertFailed(result);
  assert.equal(controller.getSnapshot().undoDepth, 0);
  assert.equal(assigned(context, "groceries"), 1200);
  assert.equal(assigned(context, "mortgage"), 300);
}

async function testUndoRestoresExactOriginalsWithDecimalRounding(): Promise<void> {
  const context = new InMemoryBudgetMoneyMovementContext(
    createBudgetView({
      groceriesAssigned: 0.3,
      mortgageAssigned: 0.2,
    }),
  );
  const controller = createUndoRedoController<BudgetMoneyMovementContext>({
    getContext: () => context,
  });

  await moveBudgetMoneyWithUndo(controller, {
    month: MONTH,
    sourceCategoryId: "groceries",
    destinationCategoryId: "mortgage",
    amount: 0.1,
  });
  assert.notEqual(assigned(context, "groceries"), 0.3);
  assert.notEqual(assigned(context, "mortgage"), 0.2);

  await controller.undo();
  assert.equal(assigned(context, "groceries"), 0.3);
  assert.equal(assigned(context, "mortgage"), 0.2);
  assertBudgetCalculations(context.view());
}

async function testMultipleMovementsUndoRedoInOrder(): Promise<void> {
  const context = new InMemoryBudgetMoneyMovementContext();
  const controller = createUndoRedoController<BudgetMoneyMovementContext>({
    getContext: () => context,
  });

  await moveBudgetMoneyWithUndo(controller, {
    month: MONTH,
    sourceCategoryId: "groceries",
    destinationCategoryId: "mortgage",
    amount: 100,
  });
  await moveBudgetMoneyWithUndo(controller, {
    month: MONTH,
    sourceCategoryId: "mortgage",
    destinationCategoryId: "dining",
    amount: 50,
  });

  assert.equal(assigned(context, "groceries"), 1100);
  assert.equal(assigned(context, "mortgage"), 350);
  assert.equal(assigned(context, "dining"), 250);

  await controller.undo();
  assert.equal(assigned(context, "groceries"), 1100);
  assert.equal(assigned(context, "mortgage"), 400);
  assert.equal(assigned(context, "dining"), 200);

  await controller.undo();
  assert.equal(assigned(context, "groceries"), 1200);
  assert.equal(assigned(context, "mortgage"), 300);
  assert.equal(assigned(context, "dining"), 200);

  await controller.redo();
  assert.equal(assigned(context, "groceries"), 1100);
  assert.equal(assigned(context, "mortgage"), 400);
  assert.equal(assigned(context, "dining"), 200);

  await controller.redo();
  assert.equal(assigned(context, "groceries"), 1100);
  assert.equal(assigned(context, "mortgage"), 350);
  assert.equal(assigned(context, "dining"), 250);
  assertBudgetCalculations(context.view());
}

async function testExistingNegativeSourcePolicyIsPreserved(): Promise<void> {
  const context = new InMemoryBudgetMoneyMovementContext();
  const controller = createUndoRedoController<BudgetMoneyMovementContext>({
    getContext: () => context,
  });

  const result = await moveBudgetMoneyWithUndo(controller, {
    month: MONTH,
    sourceCategoryId: "dining",
    destinationCategoryId: "mortgage",
    amount: 500,
  });

  assertPerformed(result);
  assert.equal(assigned(context, "dining"), -300);
  assert.equal(assigned(context, "mortgage"), 800);
}

function testArtifactsDocumentTheCommand(): void {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const docs = readFileSync("docs/architecture/undo-redo.md", "utf8");
  const commandSource = readFileSync(
    "apps/web/src/features/budget/budgetMoneyMovement.ts",
    "utf8",
  );

  assert.equal(packageJson.scripts["test:v285"], "tsx tests/v285-undoable-budget-money-movement.ts");
  assert.match(docs, /money movement command/i);
  assert.match(docs, /captured original assigned amounts/i);
  assert.match(commandSource, /originalSourceAssigned/);
  assert.match(commandSource, /originalDestinationAssigned/);
  assert.match(commandSource, /UndoableCommand/);
}

await testMoveUndoRedoLabelsAndTotals();
await testNewMovementAfterUndoClearsRedoHistory();
await testInvalidInputsAreRejected();
await testFailedExecutionDoesNotEnterHistory();
await testPartialUpdatesRollbackIfSecondAssignmentFails();
await testUndoRestoresExactOriginalsWithDecimalRounding();
await testMultipleMovementsUndoRedoInOrder();
await testExistingNegativeSourcePolicyIsPreserved();
testArtifactsDocumentTheCommand();

console.log("v2.85 undoable budget money movement checks passed");
