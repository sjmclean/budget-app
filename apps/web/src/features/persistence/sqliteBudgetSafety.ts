import type { AccountRegisterQueryClient } from "./accountRegisterQueryContracts";

export const SQLITE_BUDGET_FEATURE_UNAVAILABLE_CODE = "SQLITE_BUDGET_FEATURE_UNAVAILABLE";

export class SqliteBudgetFeatureUnavailableError extends Error {
  readonly code = SQLITE_BUDGET_FEATURE_UNAVAILABLE_CODE;

  constructor(readonly feature: string) {
    super(
      `${feature} is not yet available for imported SQLite budgets. ` +
      "No budget data was changed.",
    );
    this.name = "SqliteBudgetFeatureUnavailableError";
  }
}

export async function isActiveSqliteBudget(
  client: AccountRegisterQueryClient | undefined,
  budgetId: string | null | undefined,
): Promise<boolean> {
  if (!client || !budgetId) {
    return false;
  }

  const status = await client.getBudgetStatus(budgetId);
  return status.state === "active" && (
    status.capabilities.accountRegisters ||
    status.capabilities.budgetMonths ||
    status.capabilities.analytics
  );
}

export async function assertLegacyBudgetFeatureAvailable(
  client: AccountRegisterQueryClient | undefined,
  budgetId: string | null | undefined,
  feature: string,
): Promise<void> {
  if (await isActiveSqliteBudget(client, budgetId)) {
    throw new SqliteBudgetFeatureUnavailableError(feature);
  }
}

