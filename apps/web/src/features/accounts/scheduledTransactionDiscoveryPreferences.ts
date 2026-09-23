const STORAGE_KEY_PREFIX = "budget-app:scheduled-discovery-ignored:";

export function readIgnoredScheduledTransactionSuggestions(
  budgetId: string | null,
  accountId: string,
): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(budgetId, accountId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string" && value.length > 0)
        : [],
    );
  } catch {
    return new Set();
  }
}

export function ignoreScheduledTransactionSuggestion(
  budgetId: string | null,
  accountId: string,
  fingerprint: string,
): Set<string> {
  const ignored = readIgnoredScheduledTransactionSuggestions(budgetId, accountId);
  ignored.add(fingerprint);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      storageKey(budgetId, accountId),
      JSON.stringify([...ignored].sort()),
    );
  }
  return ignored;
}

function storageKey(budgetId: string | null, accountId: string): string {
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(budgetId ?? "legacy")}:${encodeURIComponent(accountId)}`;
}
