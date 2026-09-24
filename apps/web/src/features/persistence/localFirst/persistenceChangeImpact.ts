import type { PersistenceChangeScope } from "../persistenceChangeBus";
import type { LocalTransactionRecord } from "./registerSchema";

/** Derives transaction invalidation from both sides of a committed transition. */
export function deriveTransactionChangeScope(input: {
  readonly budgetId: string;
  readonly before?: readonly LocalTransactionRecord[];
  readonly after?: readonly LocalTransactionRecord[];
  readonly transactionIds?: readonly string[];
}): PersistenceChangeScope {
  const records = [...(input.before ?? []), ...(input.after ?? [])];
  const beforeById = new Map((input.before ?? []).map((record) => [record.id, record]));
  const afterById = new Map((input.after ?? []).map((record) => [record.id, record]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  const affectsBudget = [...ids].some((id) => {
    const before = beforeById.get(id); const after = afterById.get(id);
    return !before || !after || !sameBudgetImpact(before, after);
  });
  return {
    budgetId: input.budgetId,
    domains: affectsBudget ? ["transactions", "budget"] : ["transactions"],
    accountIds: unique(records.flatMap(({ accountId, transferAccountId }) =>
      [accountId, ...(transferAccountId ? [transferAccountId] : [])])),
    transactionIds: unique(input.transactionIds ?? records.map(({ id }) => id)),
    categoryIds: unique(records.flatMap(({ categoryId }) => categoryId ? [categoryId] : [])),
    months: unique(records.flatMap(transactionImpactMonths)),
  };
}

function sameBudgetImpact(left: LocalTransactionRecord, right: LocalTransactionRecord): boolean {
  return left.accountId === right.accountId && left.date === right.date && left.amount === right.amount &&
    left.categoryId === right.categoryId && left.incomeBudgetMonth === right.incomeBudgetMonth &&
    left.transferAccountId === right.transferAccountId &&
    left.transferTransactionId === right.transferTransactionId && splitImpact(left) === splitImpact(right);
}

function splitImpact(record: LocalTransactionRecord): string {
  return record.splitLines.map(({ categoryId, incomeBudgetMonth, transferAccountId, transferTransactionId, amount }) =>
    `${categoryId ?? ""}\u0000${incomeBudgetMonth ?? ""}\u0000${transferAccountId ?? ""}\u0000${transferTransactionId ?? ""}\u0000${amount}`).join("\u0001");
}

function transactionImpactMonths(record: LocalTransactionRecord): string[] {
  const months = /^\d{4}-\d{2}/.test(record.date) ? [record.date.slice(0, 7)] : [];
  if (record.incomeBudgetMonth) months.push(record.incomeBudgetMonth);
  for (const split of record.splitLines) {
    if (split.incomeBudgetMonth) months.push(split.incomeBudgetMonth);
  }
  return months;
}

function unique(values: readonly string[]): string[] | undefined {
  return values.length > 0 ? [...new Set(values)].sort() : undefined;
}

export function mergePersistenceChangeScopes(
  budgetId: string,
  ...scopes: readonly PersistenceChangeScope[]
): PersistenceChangeScope {
  if (scopes.some((scope) => scope.budgetId !== budgetId)) {
    throw new Error("Persistence change scopes cannot merge across budgets.");
  }
  return {
    budgetId,
    domains: unique(scopes.flatMap(({ domains }) => domains)) as PersistenceChangeScope["domains"],
    accountIds: mergeOptionalDimension(scopes.map(({ accountIds }) => accountIds)),
    transactionIds: mergeOptionalDimension(scopes.map(({ transactionIds }) => transactionIds)),
    categoryIds: mergeOptionalDimension(scopes.map(({ categoryIds }) => categoryIds)),
    months: mergeOptionalDimension(scopes.map(({ months }) => months)),
    broad: scopes.some(({ broad }) => broad) || undefined,
  };
}

function mergeOptionalDimension(values: readonly (readonly string[] | undefined)[]): string[] | undefined {
  return values.some((value) => value === undefined)
    ? undefined
    : unique(values.flatMap((value) => value ?? []));
}
