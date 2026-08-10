import type { HostedAccountRegisterQueryClient } from "./hostedAccountRegisterQueryClient";

export const HOSTED_SQLITE_SAFETY_CODE = "HOSTED_SQLITE_FEATURE_UNAVAILABLE";

export class HostedSqliteFeatureUnavailableError extends Error {
  readonly code = HOSTED_SQLITE_SAFETY_CODE;

  constructor(readonly feature: string) {
    super(
      `${feature} is not yet available for imported SQLite budgets. ` +
      "No budget data was changed.",
    );
    this.name = "HostedSqliteFeatureUnavailableError";
  }
}

export async function isHostedSqliteBudget(
  client: HostedAccountRegisterQueryClient | undefined,
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

export async function assertBrowserBudgetFeatureAvailable(
  client: HostedAccountRegisterQueryClient | undefined,
  budgetId: string | null | undefined,
  feature: string,
): Promise<void> {
  if (await isHostedSqliteBudget(client, budgetId)) {
    throw new HostedSqliteFeatureUnavailableError(feature);
  }
}

