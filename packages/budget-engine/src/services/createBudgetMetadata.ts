import { randomUUID } from "crypto";
import { BudgetMetadata } from "../../../types/src/BudgetMetadata.js";

export function createBudgetMetadata(
  budgetId: string,
  schemaVersion = 1,
  appVersion = "0.6.0"
): BudgetMetadata {
  const now = new Date();

  return {
    id: randomUUID(),
    budgetId,
    schemaVersion,
    appVersion,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: null
  };
}

export function markBudgetOpened(metadata: BudgetMetadata): BudgetMetadata {
  const now = new Date();

  return {
    ...metadata,
    updatedAt: now,
    lastOpenedAt: now
  };
}
