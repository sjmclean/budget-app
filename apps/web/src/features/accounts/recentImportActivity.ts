export interface RecentImportActivity {
  readonly version: 1;
  readonly budgetId: string;
  readonly accountId: string;
  readonly importedTransactionIds: readonly string[];
  readonly matchedTransactionIds: readonly string[];
  readonly highlightStartedAt?: number;
  readonly highlightPending?: boolean;
}

export const RECENT_IMPORT_HIGHLIGHT_DURATION_MS = 15 * 60 * 1000;

export function createRecentImportActivity(input: {
  budgetId: string;
  accountId: string;
  importedTransactionIds: readonly string[];
  matchedTransactionIds: readonly string[];
  highlightPending: boolean;
  now?: number;
}): RecentImportActivity {
  return {
    version: 1,
    budgetId: input.budgetId,
    accountId: input.accountId,
    importedTransactionIds: [...new Set(input.importedTransactionIds)],
    matchedTransactionIds: [...new Set(input.matchedTransactionIds)],
    highlightStartedAt: input.now ?? Date.now(),
    highlightPending: input.highlightPending,
  };
}

export function shouldActivateRecentImportHighlight(
  activity: RecentImportActivity,
  now = Date.now(),
): boolean {
  const startedAt = activity.highlightStartedAt;
  if (
    activity.highlightPending !== true ||
    typeof startedAt !== "number" ||
    !Number.isFinite(startedAt)
  ) {
    return false;
  }

  const age = now - startedAt;
  return age >= 0 && age < RECENT_IMPORT_HIGHLIGHT_DURATION_MS;
}

export function consumeRecentImportHighlight(
  activity: RecentImportActivity,
): RecentImportActivity {
  return activity.highlightPending
    ? { ...activity, highlightPending: false }
    : activity;
}
