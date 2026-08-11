import type { NewRegisterTransactionInput, RegisterTransactionView } from "./accountRegisterTypes";

export interface TransactionImportOutcomeSummary {
  total: number;
  imported: number;
  matched: number;
  skipped: number;
  failed: number;
  alreadyPresent: number;
}

export function summariseTransactionImportOutcomes(input: Omit<TransactionImportOutcomeSummary, "total"> & { total: number }) {
  const accounted =
    input.imported +
    input.matched +
    input.skipped +
    input.failed +
    input.alreadyPresent;
  if (accounted !== input.total) {
    throw new Error(`Import outcome accounting mismatch: ${accounted} outcomes for ${input.total} preview rows.`);
  }
  return { ...input };
}

export function verifyPersistedImportTransactions(
  expected: readonly NewRegisterTransactionInput[],
  persisted: readonly RegisterTransactionView[],
): void {
  const byId = new Map(persisted.map((transaction) => [transaction.id, transaction]));
  for (const transaction of expected) {
    if (!transaction.id) throw new Error("A committed import transaction has no stable ID.");
    const actual = byId.get(transaction.id);
    if (!actual) throw new Error(`Committed import transaction ${transaction.id} was not found after persistence.`);
    if (actual.date !== transaction.date ||
        Math.round(actual.inflow * 100) !== Math.round(transaction.inflow * 100) ||
        Math.round(actual.outflow * 100) !== Math.round(transaction.outflow * 100) ||
        actual.payee !== transaction.payee ||
        actual.rawPayee !== transaction.rawPayee) {
      throw new Error(`Committed import transaction ${transaction.id} differs from the reviewed commit plan.`);
    }
  }
}
