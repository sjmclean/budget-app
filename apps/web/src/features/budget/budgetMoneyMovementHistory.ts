import type { UndoRedoHistoryEntry } from "../history";
import {
  isBudgetAssignmentHistoryEntry,
  type BudgetAssignmentHistoryEntry,
} from "./budgetAssignmentEditing";
import {
  isBudgetMoneyMovementHistoryEntry,
  type BudgetMoneyMovementHistoryEntry,
  type BudgetMoneyMovementHistorySource,
} from "./budgetMoneyMovement";
import { normaliseMoney } from "./moneyMath";

interface ManualAssignmentDelta {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly amount: number;
}

function deriveBalancedManualSegment(
  entries: readonly BudgetAssignmentHistoryEntry[],
  currencyCode: string,
): BudgetMoneyMovementHistoryEntry[] {
  const byCategory = new Map<
    string,
    { categoryId: string; categoryName: string; amount: number }
  >();

  for (const entry of entries) {
    for (const change of entry.payload.changes) {
      const delta = normaliseMoney(
        change.finalAssigned - change.originalAssigned,
      );
      if (delta === 0) continue;

      const existing = byCategory.get(change.categoryId);
      byCategory.set(change.categoryId, {
        categoryId: change.categoryId,
        categoryName: change.categoryName,
        amount: normaliseMoney((existing?.amount ?? 0) + delta),
      });
    }
  }

  const sources = [...byCategory.values()]
    .filter((change) => change.amount < 0)
    .map((change) => ({
      ...change,
      remaining: normaliseMoney(Math.abs(change.amount)),
    }));
  const destinations = [...byCategory.values()]
    .filter((change) => change.amount > 0)
    .map((change) => ({
      ...change,
      remaining: normaliseMoney(change.amount),
    }));

  if (sources.length === 0 || destinations.length === 0) {
    return [];
  }

  const occurredAt = entries.at(-1)?.occurredAt ?? new Date(0).toISOString();
  const segmentId = entries.map((entry) => entry.id).join("|");
  const movements: BudgetMoneyMovementHistoryEntry[] = [];

  for (const destination of destinations) {
    const movementSources: BudgetMoneyMovementHistorySource[] = [];
    let remaining = destination.remaining;

    for (const source of sources) {
      if (remaining <= 0 || source.remaining <= 0) continue;

      const amount = normaliseMoney(Math.min(remaining, source.remaining));
      if (amount <= 0) continue;

      movementSources.push({
        categoryId: source.categoryId,
        categoryName: source.categoryName,
        amount,
      });
      source.remaining = normaliseMoney(source.remaining - amount);
      remaining = normaliseMoney(remaining - amount);
    }

    if (remaining !== 0 || movementSources.length === 0) {
      return [];
    }

    movements.push({
      id: `manual-money-movement:${segmentId}:${destination.categoryId}`,
      kind: "budget-money-movement",
      occurredAt,
      payload: {
        month: entries[0]!.payload.month,
        currencyCode,
        amount: normaliseMoney(destination.amount),
        sources: movementSources,
        destinationCategoryId: destination.categoryId,
        destinationCategoryName: destination.categoryName,
      },
    });
  }

  if (sources.some((source) => source.remaining !== 0)) {
    return [];
  }

  return movements;
}

function deriveManualAssignmentRun(
  entries: readonly BudgetAssignmentHistoryEntry[],
  currencyCode: string,
): BudgetMoneyMovementHistoryEntry[] {
  const movements: BudgetMoneyMovementHistoryEntry[] = [];
  let start = 0;

  while (start < entries.length) {
    let runningDelta = 0;
    let hasIncrease = false;
    let hasDecrease = false;
    let matchedEnd = -1;

    for (let end = start; end < entries.length; end += 1) {
      let entryDelta = 0;
      for (const change of entries[end]!.payload.changes) {
        const delta = normaliseMoney(
          change.finalAssigned - change.originalAssigned,
        );
        entryDelta = normaliseMoney(entryDelta + delta);
        hasIncrease ||= delta > 0;
        hasDecrease ||= delta < 0;
      }

      const nextRunningDelta = normaliseMoney(runningDelta + entryDelta);
      if (
        runningDelta !== 0 &&
        nextRunningDelta !== 0 &&
        Math.sign(runningDelta) !== Math.sign(nextRunningDelta)
      ) {
        break;
      }

      runningDelta = nextRunningDelta;
      if (runningDelta === 0 && hasIncrease && hasDecrease) {
        matchedEnd = end;
        break;
      }
    }

    if (matchedEnd < 0) {
      start += 1;
      continue;
    }

    movements.push(
      ...deriveBalancedManualSegment(
        entries.slice(start, matchedEnd + 1),
        currencyCode,
      ),
    );
    start = matchedEnd + 1;
  }

  return movements;
}

export function deriveBudgetMoneyMovementHistory(
  entries: readonly UndoRedoHistoryEntry[],
  currencyCode: string | null | undefined,
): readonly BudgetMoneyMovementHistoryEntry[] {
  const result: BudgetMoneyMovementHistoryEntry[] = [];
  let manualRun: BudgetAssignmentHistoryEntry[] = [];

  function flushManualRun() {
    if (manualRun.length > 0 && currencyCode?.trim()) {
      result.push(...deriveManualAssignmentRun(manualRun, currencyCode));
    }
    manualRun = [];
  }

  for (const entry of entries) {
    if (isBudgetAssignmentHistoryEntry(entry)) {
      if (
        manualRun.length > 0 &&
        manualRun[0]!.payload.month !== entry.payload.month
      ) {
        flushManualRun();
      }
      manualRun.push(entry);
      continue;
    }

    flushManualRun();

    if (isBudgetMoneyMovementHistoryEntry(entry)) {
      result.push(entry);
    }
  }

  flushManualRun();
  return result;
}
