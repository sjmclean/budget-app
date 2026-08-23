import type { UndoableCommand } from "../history";
import type {
  BudgetCategoryAssignedValue,
  BudgetMoneyMovementContext,
} from "./budgetMoneyMovement";
import { normaliseMoney } from "./moneyMath";

export interface BudgetAssignmentChange {
  categoryId: string;
  categoryName: string;
  originalAssigned: number;
  finalAssigned: number;
}

export interface BudgetAssignmentChangesCommandInput {
  month: string;
  changes: BudgetAssignmentChange[];
}

function validateMonth(month: string): void {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const monthNumber = match ? Number(match[2]) : NaN;

  if (!match || monthNumber < 1 || monthNumber > 12) {
    throw new Error("Budget month must use YYYY-MM.");
  }
}

function validateChanges(changes: BudgetAssignmentChange[]): void {
  if (changes.length === 0) {
    throw new Error("At least one budget assignment change is required.");
  }

  const categoryIds = new Set<string>();

  for (const change of changes) {
    if (!change.categoryId) {
      throw new Error("Budget assignment change is missing a category.");
    }

    if (categoryIds.has(change.categoryId)) {
      throw new Error("Budget assignment changes must not contain duplicate categories.");
    }

    if (!Number.isFinite(change.originalAssigned) || !Number.isFinite(change.finalAssigned)) {
      throw new Error("Budget assignment values must be finite.");
    }

    categoryIds.add(change.categoryId);
  }
}

function toAssignments(
  changes: BudgetAssignmentChange[],
  key: "originalAssigned" | "finalAssigned",
): BudgetCategoryAssignedValue[] {
  return changes.map((change) => ({
    categoryId: change.categoryId,
    assigned: normaliseMoney(change[key]),
  }));
}

function createLabel(changes: BudgetAssignmentChange[]): string {
  if (changes.length === 1) {
    return `Change ${changes[0].categoryName} assignment`;
  }

  return `Change ${changes.length} budget assignments`;
}

export function createBudgetAssignmentChangesCommand(
  input: BudgetAssignmentChangesCommandInput,
): UndoableCommand<BudgetMoneyMovementContext> {
  const meaningfulChanges = input.changes.filter(
    (change) => normaliseMoney(change.originalAssigned) !== normaliseMoney(change.finalAssigned),
  );

  return {
    id: `budget-assignment-changes:${input.month}:${Date.now()}`,
    label: createLabel(meaningfulChanges),
    async execute(context) {
      validateMonth(input.month);
      validateChanges(meaningfulChanges);
      await context.setCategoryAssignedValues({
        month: input.month,
        assignments: toAssignments(meaningfulChanges, "finalAssigned"),
      });
    },
    async undo(context) {
      await context.setCategoryAssignedValues({
        month: input.month,
        assignments: toAssignments(meaningfulChanges, "originalAssigned"),
      });
    },
    async redo(context) {
      await context.setCategoryAssignedValues({
        month: input.month,
        assignments: toAssignments(meaningfulChanges, "finalAssigned"),
      });
    },
  };
}

export interface BudgetAssignmentEditSession {
  record(change: BudgetAssignmentChange): void;
  hasChanges(): boolean;
  consume(): BudgetAssignmentChange[];
  clear(): void;
}

export function createBudgetAssignmentEditSession(): BudgetAssignmentEditSession {
  const changes = new Map<string, BudgetAssignmentChange>();

  return {
    record(change) {
      const existing = changes.get(change.categoryId);
      const originalAssigned = existing?.originalAssigned ?? change.originalAssigned;
      const nextChange = {
        ...change,
        originalAssigned,
        finalAssigned: normaliseMoney(change.finalAssigned),
      };

      if (normaliseMoney(originalAssigned) === nextChange.finalAssigned) {
        changes.delete(change.categoryId);
        return;
      }

      changes.set(change.categoryId, nextChange);
    },
    hasChanges() {
      return changes.size > 0;
    },
    consume() {
      const result = Array.from(changes.values());
      changes.clear();
      return result;
    },
    clear() {
      changes.clear();
    },
  };
}
