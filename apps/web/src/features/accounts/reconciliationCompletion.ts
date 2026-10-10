/**
 * Pure validation for an explicit account reconciliation completion.
 * Monetary values are always integer minor units (cents for AUD).
 * The caller must re-read authoritative account/transaction data inside its
 * atomic persistence operation before relying on these checks.
 */
export interface ReconciliationCandidate {
  readonly id: string;
  readonly accountId: string;
  readonly date: string;
  readonly amount: number;
  readonly clearedStatus: string;
}

export interface ReconciliationCompletionInput {
  readonly accountId: string;
  readonly statementDate: string;
  readonly statementBalanceMinor: number;
  readonly openingBalanceMinor: number;
  readonly transactions: readonly ReconciliationCandidate[];
}

export interface ReconciliationCompletionPlan {
  readonly transactionIds: readonly string[];
  readonly clearedBalanceMinor: number;
  readonly statementBalanceMinor: number;
  readonly statementDate: string;
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function planReconciliationCompletion(input: ReconciliationCompletionInput): ReconciliationCompletionPlan {
  if (!input.accountId) throw new Error("Reconciliation requires an account.");
  if (!validCalendarDate(input.statementDate)) throw new Error("Invalid reconciliation statement date.");
  if (!Number.isSafeInteger(input.statementBalanceMinor) || !Number.isSafeInteger(input.openingBalanceMinor)) {
    throw new Error("Reconciliation balances must be integer minor units.");
  }

  let clearedBalanceMinor = input.openingBalanceMinor;
  const transactionIds: string[] = [];
  const seen = new Set<string>();
  for (const row of input.transactions) {
    if (!row.id || seen.has(row.id)) throw new Error("Duplicate or missing reconciliation transaction ID.");
    seen.add(row.id);
    if (row.accountId !== input.accountId) throw new Error("Reconciliation includes a transaction from another account.");
    if (!validCalendarDate(row.date) || !Number.isSafeInteger(row.amount)) {
      throw new Error("Invalid reconciliation transaction.");
    }
    if (!["uncleared", "cleared", "reconciled"].includes(row.clearedStatus)) {
      throw new Error("Unknown reconciliation transaction status.");
    }
    if (row.date > input.statementDate || row.clearedStatus === "uncleared") continue;
    clearedBalanceMinor += row.amount;
    if (!Number.isSafeInteger(clearedBalanceMinor)) throw new Error("Reconciliation balance exceeds safe integer range.");
    if (row.clearedStatus === "cleared") transactionIds.push(row.id);
  }

  if (clearedBalanceMinor !== input.statementBalanceMinor) {
    throw new Error("The cleared account balance does not match the statement balance.");
  }
  return { transactionIds, clearedBalanceMinor, statementBalanceMinor: input.statementBalanceMinor, statementDate: input.statementDate };
}

/**
 * A durable record of a successfully completed account reconciliation.
 *
 * This is a persistence contract, not a claim that the checkpoint was committed.
 * The authoritative worker must generate and insert it within the SAME SQLite
 * transaction that changes cleared transactions to reconciled and records outbox
 * mutations. A failed transaction must leave neither statuses nor checkpoint.
 */
export interface ReconciliationCheckpoint {
  readonly id: string;
  readonly budgetId: string;
  readonly accountId: string;
  readonly statementDate: string;
  readonly statementBalanceMinor: number;
  readonly completedAt: string;
  readonly transactionIds: readonly string[];
}

export function prepareReconciliationCheckpoint(
  plan: ReconciliationCompletionPlan,
  input: {
    readonly id: string;
    readonly budgetId: string;
    readonly accountId: string;
    readonly completedAt: string;
  },
): ReconciliationCheckpoint {
  if (!input.id.trim() || !input.budgetId.trim() || !input.accountId.trim()) {
    throw new Error("A reconciliation checkpoint requires stable identifiers.");
  }
  if (Number.isNaN(Date.parse(input.completedAt)) || !/^\d{4}-\d{2}-\d{2}T/.test(input.completedAt)) {
    throw new Error("Invalid reconciliation completion timestamp.");
  }
  return {
    id: input.id,
    budgetId: input.budgetId,
    accountId: input.accountId,
    statementDate: plan.statementDate,
    statementBalanceMinor: plan.statementBalanceMinor,
    completedAt: input.completedAt,
    transactionIds: [...plan.transactionIds],
  };
}
