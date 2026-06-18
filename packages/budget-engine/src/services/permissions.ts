import { BudgetRole } from "../../../types/src/BudgetRole.js";

export function canViewBudget(role: BudgetRole | null): boolean {
  return role === BudgetRole.Owner || role === BudgetRole.Editor || role === BudgetRole.Viewer;
}

export function canEditBudget(role: BudgetRole | null): boolean {
  return role === BudgetRole.Owner || role === BudgetRole.Editor;
}

export function canDeleteBudget(role: BudgetRole | null): boolean {
  return role === BudgetRole.Owner;
}

export function canManageBudgetUsers(role: BudgetRole | null): boolean {
  return role === BudgetRole.Owner;
}
