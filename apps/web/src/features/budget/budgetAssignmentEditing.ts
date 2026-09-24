import type { UndoableCommand, UndoRedoHistoryEntry } from "../history";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
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

export interface BudgetAssignmentHistoryChange {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly originalAssigned: number;
  readonly finalAssigned: number;
}

export interface BudgetAssignmentHistoryEntry extends UndoRedoHistoryEntry {
  readonly kind: "budget-assignment-changes";
  readonly payload: {
    readonly month: string;
    readonly changes: readonly BudgetAssignmentHistoryChange[];
  };
}

export function isBudgetAssignmentHistoryEntry(
  entry: UndoRedoHistoryEntry,
): entry is BudgetAssignmentHistoryEntry {
  return entry.kind === "budget-assignment-changes";
}

function combineAssignmentHistoryEntries(
  entries: readonly BudgetAssignmentHistoryEntry[],
): BudgetAssignmentHistoryChange[] {
  const combined = new Map<string, BudgetAssignmentHistoryChange>();

  for (const entry of entries) {
    for (const change of entry.payload.changes) {
      const existing = combined.get(change.categoryId);
      combined.set(change.categoryId, {
        categoryId: change.categoryId,
        categoryName: change.categoryName,
        originalAssigned: existing?.originalAssigned ?? change.originalAssigned,
        finalAssigned: change.finalAssigned,
      });
    }
  }

  return [...combined.values()].filter(
    (change) =>
      normaliseMoney(change.originalAssigned) !==
      normaliseMoney(change.finalAssigned),
  );
}

function createCollapsedMovementLabel(
  changes: readonly BudgetAssignmentHistoryChange[],
): string {
  const sources = changes.filter(
    (change) => change.finalAssigned < change.originalAssigned,
  );
  const destinations = changes.filter(
    (change) => change.finalAssigned > change.originalAssigned,
  );

  if (destinations.length === 1) {
    const sourceLabel =
      sources.length === 1
        ? sources[0]!.categoryName
        : `${sources.length} categories`;
    return `Move money from ${sourceLabel} to ${destinations[0]!.categoryName}`;
  }

  return "Move money between categories";
}

export function createCollapsedBudgetAssignmentMovementCommand(
  entries: readonly BudgetAssignmentHistoryEntry[],
): UndoableCommand<BudgetMoneyMovementContext> {
  if (entries.length === 0) {
    throw new Error("At least one assignment history entry is required.");
  }

  const month = entries[0]!.payload.month;
  if (entries.some((entry) => entry.payload.month !== month)) {
    throw new Error("Collapsed assignment movement must stay within one budget month.");
  }

  const changes = combineAssignmentHistoryEntries(entries);
  validateChanges(changes);

  const commandId = `budget-assignment-movement:${createRuntimeUuid()}`;
  const historyEntry: BudgetAssignmentHistoryEntry = {
    id: commandId,
    kind: "budget-assignment-changes",
    occurredAt: entries.at(-1)!.occurredAt,
    payload: {
      month,
      changes,
    },
  };

  return {
    id: commandId,
    label: createCollapsedMovementLabel(changes),
    historyEntry,
    async execute(context) {
      await context.setCategoryAssignedValues({
        month,
        assignments: toAssignments(changes, "finalAssigned"),
      });
    },
    async undo(context) {
      await context.setCategoryAssignedValues({
        month,
        assignments: toAssignments(changes, "originalAssigned"),
      });
    },
    async redo(context) {
      await context.setCategoryAssignedValues({
        month,
        assignments: toAssignments(changes, "finalAssigned"),
      });
    },
  };
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

  let historyEntry: BudgetAssignmentHistoryEntry | null = null;
  const commandId = `budget-assignment-changes:${createRuntimeUuid()}`;

  return {
    id: commandId,
    label: createLabel(meaningfulChanges),
    get historyEntry() {
      return historyEntry;
    },
    async execute(context) {
      validateMonth(input.month);
      validateChanges(meaningfulChanges);
      await context.setCategoryAssignedValues({
        month: input.month,
        assignments: toAssignments(meaningfulChanges, "finalAssigned"),
      });
      historyEntry = {
        id: commandId,
        kind: "budget-assignment-changes",
        occurredAt: new Date().toISOString(),
        payload: {
          month: input.month,
          changes: meaningfulChanges.map((change) => ({
            categoryId: change.categoryId,
            categoryName: change.categoryName,
            originalAssigned: normaliseMoney(change.originalAssigned),
            finalAssigned: normaliseMoney(change.finalAssigned),
          })),
        },
      };
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
