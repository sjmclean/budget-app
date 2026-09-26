import type { ScheduledIncomeBudgetMonthOffset } from "./scheduledTransactionTypes";

export interface ScheduledIncomeCategoryChoice {
  readonly value: string;
  readonly incomeBudgetMonthOffset: ScheduledIncomeBudgetMonthOffset;
}

const CHOICES: readonly ScheduledIncomeCategoryChoice[] = Object.freeze([
  Object.freeze({
    value: "Income for transaction month",
    incomeBudgetMonthOffset: 0,
  }),
  Object.freeze({
    value: "Income for following month",
    incomeBudgetMonthOffset: 1,
  }),
]);

export function scheduledIncomeCategoryChoices(): readonly ScheduledIncomeCategoryChoice[] {
  return CHOICES;
}

export function resolveScheduledIncomeCategoryChoice(
  value: string,
): ScheduledIncomeCategoryChoice | null {
  const normalised = value.trim().toLocaleLowerCase();
  return CHOICES.find(
    (choice) => choice.value.toLocaleLowerCase() === normalised,
  ) ?? null;
}

export function scheduledIncomeCategoryValue(
  offset: ScheduledIncomeBudgetMonthOffset,
): string {
  return CHOICES.find(
    (choice) => choice.incomeBudgetMonthOffset === offset,
  )!.value;
}
