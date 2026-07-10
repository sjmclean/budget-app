import type {
  UndoableCommand,
  UndoRedoController,
  UndoRedoResult,
} from "../history";
import type {
  BudgetCategoryGroupView,
  BudgetCategoryView,
  BudgetMonthView,
  BudgetViewService,
} from "./budgetViewTypes";
import { isMoneyNegative, normaliseMoney } from "./moneyMath";

export interface MoveBudgetMoneyCommandInput {
  month: string;
  sourceCategoryId: string;
  destinationCategoryId: string;
  amount: number;
}

export interface BudgetCategoryAssignedValue {
  categoryId: string;
  assigned: number;
}

export interface BudgetMoneyMovementContext {
  getBudgetMonthView(month: string): BudgetMonthView | Promise<BudgetMonthView>;
  setCategoryAssignedValues(input: {
    month: string;
    assignments: BudgetCategoryAssignedValue[];
  }): BudgetMonthView | Promise<BudgetMonthView>;
}

export interface BudgetViewMoneyMovementContextOptions {
  budgetId: string;
  budgetViewService: Pick<
    BudgetViewService,
    "getBudgetMonthView" | "setCategoryAssignedValues"
  >;
}

interface CategoryLocation {
  group: BudgetCategoryGroupView;
  category: BudgetCategoryView;
}

interface MoneyMovementCapture {
  sourceCategoryId: string;
  sourceCategoryName: string;
  destinationCategoryId: string;
  destinationCategoryName: string;
  currencyCode: string;
  originalSourceAssigned: number;
  originalDestinationAssigned: number;
}

function validateMonth(month: string): void {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const monthNumber = match ? Number(match[2]) : NaN;

  if (!match || monthNumber < 1 || monthNumber > 12) {
    throw new Error("Budget month must use YYYY-MM.");
  }
}

function validateMoveInput(input: MoveBudgetMoneyCommandInput): void {
  validateMonth(input.month);

  if (!Number.isFinite(input.amount)) {
    throw new Error("Move amount must be finite.");
  }

  if (input.amount <= 0) {
    throw new Error("Move amount must be positive.");
  }

  if (input.sourceCategoryId === input.destinationCategoryId) {
    throw new Error("Choose two different categories to move money.");
  }
}

function formatMovementAmount(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
}

function createMovementLabel(input: {
  amount: number;
  currencyCode: string;
  sourceCategoryName: string;
  destinationCategoryName: string;
}): string {
  return `Move ${formatMovementAmount(input.amount, input.currencyCode)} from ${input.sourceCategoryName} to ${input.destinationCategoryName}`;
}

function findCategoryLocation(
  view: BudgetMonthView,
  categoryId: string,
): CategoryLocation | null {
  for (const group of view.categoryGroups) {
    const category = group.categories.find((item) => item.id === categoryId);

    if (category) {
      return { group, category };
    }
  }

  return null;
}

function requireMovementCapture(
  view: BudgetMonthView,
  input: MoveBudgetMoneyCommandInput,
): MoneyMovementCapture {
  const source = findCategoryLocation(view, input.sourceCategoryId);
  const destination = findCategoryLocation(view, input.destinationCategoryId);

  if (!source) {
    throw new Error("Source category was not found.");
  }

  if (!destination) {
    throw new Error("Destination category was not found.");
  }

  return {
    sourceCategoryId: source.category.id,
    sourceCategoryName: source.category.name,
    destinationCategoryId: destination.category.id,
    destinationCategoryName: destination.category.name,
    currencyCode: view.currencyCode,
    originalSourceAssigned: source.category.assigned,
    originalDestinationAssigned: destination.category.assigned,
  };
}

function movementAssignments(
  capture: MoneyMovementCapture,
  amount: number,
): BudgetCategoryAssignedValue[] {
  return [
    {
      categoryId: capture.sourceCategoryId,
      assigned: normaliseMoney(capture.originalSourceAssigned - amount),
    },
    {
      categoryId: capture.destinationCategoryId,
      assigned: normaliseMoney(capture.originalDestinationAssigned + amount),
    },
  ];
}

function originalAssignments(
  capture: MoneyMovementCapture,
): BudgetCategoryAssignedValue[] {
  return [
    {
      categoryId: capture.sourceCategoryId,
      assigned: capture.originalSourceAssigned,
    },
    {
      categoryId: capture.destinationCategoryId,
      assigned: capture.originalDestinationAssigned,
    },
  ];
}

function sumAssigned(categoryGroups: BudgetCategoryGroupView[]): number {
  return categoryGroups.reduce(
    (total, group) =>
      total +
      group.categories.reduce((groupTotal, category) => groupTotal + category.assigned, 0),
    0,
  );
}

function recalculateCategory(category: BudgetCategoryView): BudgetCategoryView {
  const previousAvailable = category.previousAvailable ?? 0;
  const assigned = normaliseMoney(category.assigned);
  const activity = category.activity ?? 0;
  const available = normaliseMoney(previousAvailable + assigned + activity);

  return {
    ...category,
    previousAvailable,
    assigned,
    activity,
    available,
    isArchived: category.isArchived ?? false,
    isOverspent: isMoneyNegative(available),
    note: category.note ?? "",
  };
}

function recalculateGroup(group: BudgetCategoryGroupView): BudgetCategoryGroupView {
  const categories = group.categories.map(recalculateCategory);
  const previousAvailable = categories.reduce(
    (total, category) => total + category.previousAvailable,
    0,
  );
  const assigned = categories.reduce((total, category) => total + category.assigned, 0);
  const activity = categories.reduce((total, category) => total + category.activity, 0);
  const available = categories.reduce((total, category) => total + category.available, 0);

  return {
    ...group,
    previousAvailable: normaliseMoney(previousAvailable),
    assigned: normaliseMoney(assigned),
    activity: normaliseMoney(activity),
    available: normaliseMoney(available),
    note: group.note ?? "",
    categories,
  };
}

function recalculateBudgetView(
  view: BudgetMonthView,
  previousTotalAssigned: number,
): BudgetMonthView {
  const categoryGroups = view.categoryGroups.map(recalculateGroup);
  const totalAssigned = categoryGroups.reduce((total, group) => total + group.assigned, 0);
  const totalActivity = categoryGroups.reduce((total, group) => total + group.activity, 0);
  const totalAvailable = categoryGroups.reduce((total, group) => total + group.available, 0);

  return {
    ...view,
    readyToAssign: normaliseMoney(view.readyToAssign + previousTotalAssigned - totalAssigned),
    totalAssigned: normaliseMoney(totalAssigned),
    totalActivity: normaliseMoney(totalActivity),
    totalAvailable: normaliseMoney(totalAvailable),
    categoryGroups,
  };
}

export function applyCategoryAssignedValues(
  view: BudgetMonthView,
  assignments: BudgetCategoryAssignedValue[],
): BudgetMonthView {
  const previousTotalAssigned = sumAssigned(view.categoryGroups);
  const assignmentByCategoryId = new Map<string, number>();

  for (const assignment of assignments) {
    if (!assignment.categoryId) {
      throw new Error("Category assignment is missing a category.");
    }

    if (!Number.isFinite(assignment.assigned)) {
      throw new Error("Category assignment must be finite.");
    }

    if (assignmentByCategoryId.has(assignment.categoryId)) {
      throw new Error("Category assignments must not contain duplicates.");
    }

    assignmentByCategoryId.set(assignment.categoryId, normaliseMoney(assignment.assigned));
  }

  const foundCategoryIds = new Set<string>();
  const categoryGroups = view.categoryGroups.map((group) => ({
    ...group,
    categories: group.categories.map((category) => {
      const assigned = assignmentByCategoryId.get(category.id);

      if (assigned === undefined) {
        return { ...category };
      }

      foundCategoryIds.add(category.id);
      return {
        ...category,
        assigned,
      };
    }),
  }));

  for (const categoryId of assignmentByCategoryId.keys()) {
    if (!foundCategoryIds.has(categoryId)) {
      throw new Error("Category not found.");
    }
  }

  return recalculateBudgetView(
    {
      ...view,
      categoryGroups,
    },
    previousTotalAssigned,
  );
}

export function createBudgetViewMoneyMovementContext({
  budgetId,
  budgetViewService,
}: BudgetViewMoneyMovementContextOptions): BudgetMoneyMovementContext {
  return {
    getBudgetMonthView(month) {
      return budgetViewService.getBudgetMonthView({ budgetId, month });
    },
    setCategoryAssignedValues({ month, assignments }) {
      return budgetViewService.setCategoryAssignedValues({ budgetId, month, assignments });
    },
  };
}

export function createMoveBudgetMoneyCommand(
  input: MoveBudgetMoneyCommandInput,
): UndoableCommand<BudgetMoneyMovementContext> {
  let capture: MoneyMovementCapture | null = null;
  let label = `Move ${formatMovementAmount(input.amount, "USD")} between categories`;

  return {
    id: `move-budget-money:${input.month}:${input.sourceCategoryId}:${input.destinationCategoryId}:${input.amount}`,
    get label() {
      return label;
    },
    async execute(context) {
      validateMoveInput(input);

      const view = await context.getBudgetMonthView(input.month);
      const nextCapture = requireMovementCapture(view, input);
      const nextLabel = createMovementLabel({
        amount: input.amount,
        currencyCode: nextCapture.currencyCode,
        sourceCategoryName: nextCapture.sourceCategoryName,
        destinationCategoryName: nextCapture.destinationCategoryName,
      });

      await context.setCategoryAssignedValues({
        month: input.month,
        assignments: movementAssignments(nextCapture, input.amount),
      });

      capture = nextCapture;
      label = nextLabel;
    },
    async undo(context) {
      if (!capture) {
        throw new Error("Move command has not been executed.");
      }

      await context.setCategoryAssignedValues({
        month: input.month,
        assignments: originalAssignments(capture),
      });
    },
    async redo(context) {
      if (!capture) {
        throw new Error("Move command has not been executed.");
      }

      await context.setCategoryAssignedValues({
        month: input.month,
        assignments: movementAssignments(capture, input.amount),
      });
    },
  };
}

export function moveBudgetMoneyWithUndo(
  controller: UndoRedoController<BudgetMoneyMovementContext>,
  input: MoveBudgetMoneyCommandInput,
): Promise<UndoRedoResult> {
  return controller.execute(createMoveBudgetMoneyCommand(input));
}
