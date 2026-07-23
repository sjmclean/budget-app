import type { AccountRegisterView } from "../../accounts/accountRegisterTypes";
import type {
  BudgetCategoryGroupView,
  BudgetMonthView,
} from "../budgetViewTypes";
import { getCurrentBudgetMonth } from "../budgetMonthNavigation";
import { isMoneyNegative, normaliseMoney } from "../moneyMath";
import { firstYnabDisplayAmount } from "../../../../../../packages/ynab4-importer/src/money/decodeYnabAmount";

import { isYnab4Tombstone } from "./ynab4RecordState";

const READY_TO_ASSIGN_CATEGORY_ID = "__ready_to_assign__";

type RecordMap = Record<string, unknown>;

export interface Ynab4BudgetMonthIdentity {
  id: string;
  name: string;
  currency: string;
}

export interface MapYnab4BudgetMonthsInput {
  budget: Ynab4BudgetMonthIdentity;
  monthlyBudgets: RecordMap[];
  templateGroups: BudgetCategoryGroupView[];
  categoryIdBySourceId: ReadonlyMap<string, string>;
  registers: Record<string, AccountRegisterView>;
  now: Date;
}

/**
 * Convert YNAB4 monthly budget rows and imported register activity into the
 * budget app's persisted month views. This mapping is deliberately independent
 * from browser storage so it can be tested before the import plan is written.
 */
export function mapYnab4BudgetMonths(
  input: MapYnab4BudgetMonthsInput,
): Map<string, BudgetMonthView> {
  const views = new Map<string, BudgetMonthView>();
  const activityByMonthCategory = buildBudgetActivityByMonthCategory(
    input.registers,
  );
  const sourceMonths = buildCompleteMonthTimeline(
    input.monthlyBudgets,
    activityByMonthCategory,
    input.now,
  );
  const previousAvailableByCategoryId = new Map<string, number>();

  for (const { monthlyBudget, month } of sourceMonths) {
    const groups = cloneCategoryGroups(input.templateGroups);
    const categoryById = new Map(
      groups.flatMap((group) =>
        group.categories.map((category) => [category.id, category] as const),
      ),
    );
    const carryoverByCategoryId = new Map<string, boolean>();

    for (const row of toRecords(monthlyBudget.monthlySubCategoryBudgets)) {
      if (isYnab4Tombstone(row)) continue;
      const categoryId = mappedId(
        input.categoryIdBySourceId,
        row.categoryId,
        row.subCategoryId,
      );
      const category = categoryId ? categoryById.get(categoryId) : undefined;
      if (!category || !categoryId) continue;
      category.assigned =
        firstYnabDisplayAmount(row.budgeted, row.assigned) ?? 0;
      const carriesNegativeBalance =
        ynab4OverspendingHandlingCarriesNegativeBalance(
          firstString(row.overspendingHandling),
        );
      carryoverByCategoryId.set(categoryId, carriesNegativeBalance);
      category.overspendingHandling = carriesNegativeBalance
        ? "carry-category"
        : "reduce-next-month";
    }

    const activityByCategory =
      activityByMonthCategory.get(month) ?? new Map<string, number>();
    for (const category of categoryById.values()) {
      const previousAvailable = roundMoney(
        previousAvailableByCategoryId.get(category.id) ?? 0,
      );
      const shouldCarryForward =
        previousAvailable > 0 || Boolean(carryoverByCategoryId.get(category.id));
      category.previousAvailable = shouldCarryForward ? previousAvailable : 0;
      category.activity = roundMoney(activityByCategory.get(category.id) ?? 0);
      category.available = normaliseMoney(
        roundMoney(
          category.previousAvailable + category.assigned + category.activity,
        ),
      );
      category.isOverspent = isMoneyNegative(category.available);
      previousAvailableByCategoryId.set(category.id, category.available);
    }

    for (const group of groups) {
      group.previousAvailable = group.categories.reduce(
        (sum, category) => sum + category.previousAvailable,
        0,
      );
      group.assigned = group.categories.reduce(
        (sum, category) => sum + category.assigned,
        0,
      );
      group.activity = group.categories.reduce(
        (sum, category) => sum + category.activity,
        0,
      );
      group.available = group.categories.reduce(
        (sum, category) => sum + category.available,
        0,
      );
    }

    const totalAssigned = groups.reduce(
      (sum, group) => sum + group.assigned,
      0,
    );
    const totalActivity = groups.reduce(
      (sum, group) => sum + group.activity,
      0,
    );
    const totalAvailable = groups.reduce(
      (sum, group) => sum + group.available,
      0,
    );
    views.set(month, {
      budgetId: input.budget.id,
      budgetName: input.budget.name,
      monthLabel: monthLabelFromIsoMonth(month),
      currencyCode: input.budget.currency,
      readyToAssign:
        firstYnabDisplayAmount(
          monthlyBudget.availableToBudget,
          monthlyBudget.buffered,
          monthlyBudget.income,
        ) ?? 0,
      totalAssigned,
      totalActivity,
      totalAvailable,
      categoryGroups: groups,
    });
  }

  return views;
}

function buildCompleteMonthTimeline(
  monthlyBudgets: RecordMap[],
  activityByMonthCategory: ReadonlyMap<string, ReadonlyMap<string, number>>,
  now: Date,
): Array<{ monthlyBudget: RecordMap; month: string }> {
  const monthlyBudgetByMonth = new Map<string, RecordMap>();

  for (const [index, monthlyBudget] of monthlyBudgets.entries()) {
    const month = requireYnab4Month(
      firstString(
        monthlyBudget.month,
        monthlyBudget.date,
        monthlyBudget.monthName,
      ),
      sourceEntityLabel(monthlyBudget, index),
    );
    monthlyBudgetByMonth.set(month, monthlyBudget);
  }

  const relevantMonths = new Set<string>([
    ...monthlyBudgetByMonth.keys(),
    ...activityByMonthCategory.keys(),
  ]);

  if (relevantMonths.size === 0) {
    relevantMonths.add(getCurrentBudgetMonth(now));
  }

  const sortedRelevantMonths = [...relevantMonths].sort((left, right) =>
    left.localeCompare(right),
  );
  const firstMonth = sortedRelevantMonths[0];
  const lastMonth = sortedRelevantMonths[sortedRelevantMonths.length - 1];

  return enumerateIsoMonths(firstMonth, lastMonth).map((month) => ({
    month,
    monthlyBudget: monthlyBudgetByMonth.get(month) ?? {
      month,
      monthlySubCategoryBudgets: [],
    },
  }));
}

function enumerateIsoMonths(firstMonth: string, lastMonth: string): string[] {
  const first = parseIsoMonth(firstMonth);
  const last = parseIsoMonth(lastMonth);
  const months: string[] = [];

  let year = first.year;
  let month = first.month;
  while (year < last.year || (year === last.year && month <= last.month)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

function parseIsoMonth(value: string): { year: number; month: number } {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

function ynab4OverspendingHandlingCarriesNegativeBalance(
  value: string | null,
): boolean {
  return value?.replace(/[\s_-]/g, "").toLowerCase() === "confined";
}

function buildBudgetActivityByMonthCategory(
  registers: Record<string, AccountRegisterView>,
): Map<string, Map<string, number>> {
  const activityByMonthCategory = new Map<string, Map<string, number>>();

  for (const register of Object.values(registers)) {
    if (register.accountType === "Tracking") continue;
    for (const transaction of register.transactions) {
      const month = transaction.date.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;

      if (transaction.splitLines && transaction.splitLines.length > 0) {
        for (const splitLine of transaction.splitLines) {
          if (splitLine.transferAccountId || splitLine.transferTransactionId) {
            continue;
          }
          if (splitLine.categoryId) {
            addBudgetActivity(
              activityByMonthCategory,
              month,
              splitLine.categoryId,
              splitLine.inflow - splitLine.outflow,
            );
          }
        }
        continue;
      }

      if (!transaction.categoryId) continue;
      addBudgetActivity(
        activityByMonthCategory,
        month,
        transaction.categoryId,
        transaction.inflow - transaction.outflow,
      );
    }
  }

  return activityByMonthCategory;
}

function addBudgetActivity(
  activityByMonthCategory: Map<string, Map<string, number>>,
  month: string,
  categoryId: string | undefined,
  amount: number,
): void {
  if (!categoryId || categoryId === READY_TO_ASSIGN_CATEGORY_ID) return;

  const byCategory =
    activityByMonthCategory.get(month) ?? new Map<string, number>();
  byCategory.set(
    categoryId,
    roundMoney((byCategory.get(categoryId) ?? 0) + amount),
  );
  activityByMonthCategory.set(month, byCategory);
}

function cloneCategoryGroups(
  groups: BudgetCategoryGroupView[],
): BudgetCategoryGroupView[] {
  return groups.map((group) => ({
    ...group,
    categories: group.categories.map((category) => ({ ...category })),
  }));
}

function requireYnab4Month(value: string | null, source: string): string {
  const month = monthKey(value);
  if (!month) {
    throw new Error(`Invalid or missing YNAB4 budget month for ${source}.`);
  }
  return month;
}

function monthKey(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromIsoMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
}

function mappedId(
  map: ReadonlyMap<string, string>,
  ...values: unknown[]
): string | null {
  for (const value of values) {
    const sourceId = firstString(value);
    if (!sourceId) continue;
    const mapped = map.get(sourceId);
    if (mapped) return mapped;
  }
  return null;
}

function toRecords(value: unknown): RecordMap[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is RecordMap =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

function sourceEntityLabel(record: RecordMap, index: number): string {
  return firstString(record.entityId, record.id, record.name) ?? `row ${index + 1}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
