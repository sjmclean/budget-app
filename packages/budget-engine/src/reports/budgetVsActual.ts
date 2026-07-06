export type BudgetVsActualStatus = "on-track" | "fully-spent" | "overspent";

export interface BudgetVsActualCategoryInput {
  categoryId: string;
  categoryName: string;
  groupName?: string;
  assigned: number;
  activity: number;
  available: number;
  isArchived?: boolean;
}

export interface BudgetVsActualRow {
  categoryId: string;
  categoryName: string;
  groupName: string;
  assigned: number;
  activity: number;
  available: number;
  status: BudgetVsActualStatus;
}

export function getBudgetVsActualStatus(available: number): BudgetVsActualStatus {
  if (available < 0) return "overspent";
  if (available === 0) return "fully-spent";
  return "on-track";
}

export function budgetVsActual(categories: BudgetVsActualCategoryInput[]): BudgetVsActualRow[] {
  return categories
    .filter((category) => !category.isArchived)
    .map((category) => ({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      groupName: category.groupName ?? "Uncategorised",
      assigned: category.assigned,
      activity: category.activity,
      available: category.available,
      status: getBudgetVsActualStatus(category.available),
    }))
    .filter((row) => row.assigned !== 0 || row.activity !== 0 || row.available !== 0)
    .sort((a, b) => {
      if (a.status === "overspent" && b.status !== "overspent") return -1;
      if (a.status !== "overspent" && b.status === "overspent") return 1;
      return Math.abs(b.activity) - Math.abs(a.activity) || a.categoryName.localeCompare(b.categoryName);
    });
}
