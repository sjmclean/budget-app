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
    const differences: string[] = [];

    if (actual.date !== transaction.date) {
      differences.push(
        `date expected=${JSON.stringify(transaction.date)} actual=${JSON.stringify(actual.date)}`,
      );
    }

    if (
      Math.round(actual.inflow * 100) !==
      Math.round(transaction.inflow * 100)
    ) {
      differences.push(
        `inflow expected=${transaction.inflow} actual=${actual.inflow}`,
      );
    }

    if (
      Math.round(actual.outflow * 100) !==
      Math.round(transaction.outflow * 100)
    ) {
      differences.push(
        `outflow expected=${transaction.outflow} actual=${actual.outflow}`,
      );
    }

    if (transaction.transferAccountId) {
      if (actual.transferAccountId !== transaction.transferAccountId) {
        differences.push(
          `transferAccountId expected=${JSON.stringify(transaction.transferAccountId)} actual=${JSON.stringify(actual.transferAccountId)}`,
        );
      }
    } else {
      if (actual.transferAccountId) {
        differences.push(
          `transferAccountId expected=null actual=${JSON.stringify(actual.transferAccountId)}`,
        );
      }

      if (actual.payee !== transaction.payee) {
        differences.push(
          `payee expected=${JSON.stringify(transaction.payee)} actual=${JSON.stringify(actual.payee)}`,
        );
      }
    }

    if (actual.rawPayee !== transaction.rawPayee) {
      differences.push(
        `rawPayee expected=${JSON.stringify(transaction.rawPayee)} actual=${JSON.stringify(actual.rawPayee)}`,
      );
    }

    if (differences.length > 0) {
      throw new Error(
        `Committed import transaction ${transaction.id} differs from the reviewed commit plan: ${differences.join("; ")}.`,
      );
    }
  }
}
