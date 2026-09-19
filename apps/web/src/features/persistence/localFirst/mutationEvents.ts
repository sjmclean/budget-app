import {
  publishPersistenceChange,
  type PersistenceChangeScope,
} from "../persistenceChangeBus";
import type { BudgetDomain, LocalBudgetMutation } from "./contracts";

export const LOCAL_FIRST_MUTATION_COMMITTED_EVENT =
  "budget-app:local-first-mutation-committed";

export interface LocalFirstMutationCommittedDetail {
  readonly budgetId: string;
  readonly scope: PersistenceChangeScope;
}

const domainMap: Record<BudgetDomain, PersistenceChangeScope["domains"]> = {
  accounts: ["accounts"], transactions: ["transactions", "budget"], payees: ["payees", "transactions"],
  categories: ["categories", "budget", "transactions"], categoryGoals: ["goals", "budget"],
  budgetMonths: ["budget", "categories"], scheduledTransactions: ["scheduled-transactions"],
  transactionTags: ["transactions"],
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function monthOf(value: unknown): string | undefined { const date = stringValue(value); return date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : undefined; }

export function persistenceScopeForMutations(budgetId: string, mutations: readonly LocalBudgetMutation[]): PersistenceChangeScope {
  const domains = new Set<PersistenceChangeScope["domains"][number]>();
  const accountIds = new Set<string>(); const transactionIds = new Set<string>();
  const categoryIds = new Set<string>(); const months = new Set<string>();
  for (const mutation of mutations) {
    for (const domain of domainMap[mutation.domain]) domains.add(domain);
    const candidates = mutation.operationGroup?.members ?? [mutation];
    for (const candidate of candidates) {
      const payload = record(candidate.payload);
      if (candidate.domain === "accounts") accountIds.add(candidate.entityId);
      if (candidate.domain === "categories" || candidate.domain === "categoryGoals") categoryIds.add(candidate.entityId);
      const accountId = stringValue(payload?.accountId); if (accountId) accountIds.add(accountId);
      const transferAccountId = stringValue(payload?.transferAccountId); if (transferAccountId) accountIds.add(transferAccountId);
      const categoryId = stringValue(payload?.categoryId); if (categoryId) categoryIds.add(categoryId);
      const month = stringValue(payload?.month) ?? stringValue(payload?.startMonth) ?? monthOf(payload?.date); if (month) months.add(month);
      const targetCategoryId = stringValue(payload?.targetCategoryId); if (targetCategoryId) categoryIds.add(targetCategoryId);
      if (candidate.domain === "transactions" && !candidate.entityId.startsWith("attachment:")) transactionIds.add(candidate.entityId);
      if (stringValue(payload?.kind)?.startsWith("transaction-attachment-")) domains.add("attachments");
    }
  }
  if (domains.size === 0) throw new Error("Committed mutations require a known persistence-change domain.");
  return { budgetId, domains: [...domains], accountIds: accountIds.size ? [...accountIds] : undefined, transactionIds: transactionIds.size ? [...transactionIds] : undefined, categoryIds: categoryIds.size ? [...categoryIds] : undefined, months: months.size ? [...months] : undefined };
}

export function notifyLocalFirstMutationCommitted(budgetId: string, scope: Omit<PersistenceChangeScope, "budgetId">): number | null {
  if (!budgetId) return null;
  const resolvedScope: PersistenceChangeScope = { budgetId, ...scope };
  const revision = publishPersistenceChange({ source: "local", scope: resolvedScope });

  if (typeof globalThis.CustomEvent === "function") {
    globalThis.dispatchEvent?.(
      new CustomEvent<LocalFirstMutationCommittedDetail>(
        LOCAL_FIRST_MUTATION_COMMITTED_EVENT,
        { detail: { budgetId, scope: resolvedScope } },
      ),
    );
  }
  return revision;
}

/** Called only after a pulled mutation batch has committed to local SQLite. */
export function notifyRemoteMutationsApplied(
  budgetId: string,
  mutations: readonly LocalBudgetMutation[],
): void {
  if (mutations.length === 0) return;
  publishPersistenceChange({
    source: "replication",
    scope: persistenceScopeForMutations(budgetId, mutations),
  });
}

export function subscribeToLocalFirstMutationCommits(
  listener: (budgetId: string) => void,
): () => void {
  const handler = (event: Event) => {
    const budgetId = (event as CustomEvent<LocalFirstMutationCommittedDetail>)
      .detail?.budgetId;
    if (budgetId) listener(budgetId);
  };
  globalThis.addEventListener?.(LOCAL_FIRST_MUTATION_COMMITTED_EVENT, handler);
  return () =>
    globalThis.removeEventListener?.(
      LOCAL_FIRST_MUTATION_COMMITTED_EVENT,
      handler,
    );
}
