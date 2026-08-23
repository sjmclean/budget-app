import type { UndoableCommand } from "../history";
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

export interface MultiSourceBudgetMoneyMovementSource {
  categoryId: string;
  amount: number;
}

export interface MoveBudgetMoneyFromMultipleSourcesCommandInput {
  month: string;
  destinationCategoryId: string;
  sources: MultiSourceBudgetMoneyMovementSource[];
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

interface MoneyMovementSourceCapture {
  categoryId: string;
  categoryName: string;
  originalAssigned: number;
  amount: number;
}

interface MultiSourceMoneyMovementCapture {
  sources: MoneyMovementSourceCapture[];
  destinationCategoryId: string;
  destinationCategoryName: string;
  originalDestinationAssigned: number;
  currencyCode: string;
}

function validateMonth(month: string): void {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const monthNumber = match ? Number(match[2]) : NaN;

  if (!match || monthNumber < 1 || monthNumber > 12) {
    throw new Error("Budget month must use YYYY-MM.");
  }
}

function validateMultiSourceMoveInput(
  input: MoveBudgetMoneyFromMultipleSourcesCommandInput,
): void {
  validateMonth(input.month);

  if (!input.destinationCategoryId) {
    throw new Error("Destination category is required.");
  }

  if (input.sources.length === 0) {
    throw new Error("Choose at least one source category.");
  }

  const sourceIds = new Set<string>();

  for (const source of input.sources) {
    if (!source.categoryId) {
      throw new Error("Source category is required.");
    }

    if (!Number.isFinite(source.amount)) {
      throw new Error("Move amount must be finite.");
    }

    if (source.amount <= 0) {
      throw new Error("Move amount must be positive.");
    }

    if (source.categoryId === input.destinationCategoryId) {
      throw new Error("Source and destination categories must be different.");
    }

    if (sourceIds.has(source.categoryId)) {
      throw new Error("Source categories must not contain duplicates.");
    }

    sourceIds.add(source.categoryId);
  }
}

function formatMovementAmount(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
}

function createMultiSourceMovementLabel(input: {
  amount: number;
  sourceCount: number;
  currencyCode: string;
  destinationCategoryName: string;
}): string {
  const sourceLabel =
    input.sourceCount === 1
      ? "1 category"
      : `${input.sourceCount} categories`;

  return `Move ${formatMovementAmount(
    input.amount,
    input.currencyCode,
  )} from ${sourceLabel} to ${input.destinationCategoryName}`;
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

function requireMultiSourceMovementCapture(
  view: BudgetMonthView,
  input: MoveBudgetMoneyFromMultipleSourcesCommandInput,
): MultiSourceMoneyMovementCapture {
  const destination = findCategoryLocation(view, input.destinationCategoryId);

  if (!destination) {
    throw new Error("Destination category was not found.");
  }

  const sources = input.sources.map((inputSource) => {
    const source = findCategoryLocation(view, inputSource.categoryId);

    if (!source) {
      throw new Error("Source category was not found.");
    }

    if (source.category.available < inputSource.amount) {
      throw new Error(
        `${source.category.name} has insufficient available funds.`,
      );
    }

    return {
      categoryId: source.category.id,
      categoryName: source.category.name,
      originalAssigned: source.category.assigned,
      amount: normaliseMoney(inputSource.amount),
    };
  });

  return {
    sources,
    destinationCategoryId: destination.category.id,
    destinationCategoryName: destination.category.name,
    originalDestinationAssigned: destination.category.assigned,
    currencyCode: view.currencyCode,
  };
}

function movedAssignments(
  capture: MultiSourceMoneyMovementCapture,
): BudgetCategoryAssignedValue[] {
  const movedTotal = normaliseMoney(
    capture.sources.reduce((total, source) => total + source.amount, 0),
  );

  return [
    ...capture.sources.map((source) => ({
      categoryId: source.categoryId,
      assigned: normaliseMoney(source.originalAssigned - source.amount),
    })),
    {
      categoryId: capture.destinationCategoryId,
      assigned: normaliseMoney(
        capture.originalDestinationAssigned + movedTotal,
      ),
    },
  ];
}

function originalAssignments(
  capture: MultiSourceMoneyMovementCapture,
): BudgetCategoryAssignedValue[] {
  return [
    ...capture.sources.map((source) => ({
      categoryId: source.categoryId,
      assigned: source.originalAssigned,
    })),
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

export function createMoveBudgetMoneyFromMultipleSourcesCommand(
  input: MoveBudgetMoneyFromMultipleSourcesCommandInput,
): UndoableCommand<BudgetMoneyMovementContext> {
  let capture: MultiSourceMoneyMovementCapture | null = null;
  let label = "Move budget money between categories";

  return {
    id: `move-budget-money:${input.month}:${input.destinationCategoryId}:${input.sources
      .map((source) => `${source.categoryId}:${source.amount}`)
      .join("|")}`,
    get label() {
      return label;
    },
    async execute(context) {
      validateMultiSourceMoveInput(input);

      const view = await context.getBudgetMonthView(input.month);
      const nextCapture = requireMultiSourceMovementCapture(view, input);
      const movedTotal = normaliseMoney(
        nextCapture.sources.reduce(
          (total, source) => total + source.amount,
          0,
        ),
      );

      await context.setCategoryAssignedValues({
        month: input.month,
        assignments: movedAssignments(nextCapture),
      });

      capture = nextCapture;
      label = createMultiSourceMovementLabel({
        amount: movedTotal,
        sourceCount: nextCapture.sources.length,
        currencyCode: nextCapture.currencyCode,
        destinationCategoryName: nextCapture.destinationCategoryName,
      });
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
        assignments: movedAssignments(capture),
      });
    },
  };
}

export function createMoveBudgetMoneyCommand(
  input: MoveBudgetMoneyCommandInput,
): UndoableCommand<BudgetMoneyMovementContext> {
  return createMoveBudgetMoneyFromMultipleSourcesCommand({
    month: input.month,
    destinationCategoryId: input.destinationCategoryId,
    sources: [
      {
        categoryId: input.sourceCategoryId,
        amount: input.amount,
      },
    ],
  });
}
