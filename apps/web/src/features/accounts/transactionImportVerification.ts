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

    const expectedSplitLines = transaction.splitLines ?? [];
    const actualSplitLines = actual.splitLines ?? [];

    if (
      transaction.category === "Split" ||
      expectedSplitLines.length > 0 ||
      actual.category === "Split" ||
      actualSplitLines.length > 0
    ) {
      if (actual.category !== transaction.category) {
        differences.push(
          `category expected=${JSON.stringify(transaction.category)} actual=${JSON.stringify(actual.category)}`,
        );
      }

      if (actual.categoryId !== transaction.categoryId) {
        differences.push(
          `categoryId expected=${JSON.stringify(transaction.categoryId)} actual=${JSON.stringify(actual.categoryId)}`,
        );
      }

      if (actualSplitLines.length !== expectedSplitLines.length) {
        differences.push(
          `splitLines.length expected=${expectedSplitLines.length} actual=${actualSplitLines.length}`,
        );
      }

      const count = Math.min(
        expectedSplitLines.length,
        actualSplitLines.length,
      );

      for (let index = 0; index < count; index += 1) {
        const expectedLine = expectedSplitLines[index];
        const actualLine = actualSplitLines[index];
        const prefix = `splitLines[${index}]`;

        if (actualLine.id !== expectedLine.id) {
          differences.push(
            `${prefix}.id expected=${JSON.stringify(expectedLine.id)} actual=${JSON.stringify(actualLine.id)}`,
          );
        }

        if (actualLine.category !== expectedLine.category) {
          differences.push(
            `${prefix}.category expected=${JSON.stringify(expectedLine.category)} actual=${JSON.stringify(actualLine.category)}`,
          );
        }

        if (actualLine.categoryId !== expectedLine.categoryId) {
          differences.push(
            `${prefix}.categoryId expected=${JSON.stringify(expectedLine.categoryId)} actual=${JSON.stringify(actualLine.categoryId)}`,
          );
        }

        if ((actualLine.memo ?? "") !== (expectedLine.memo ?? "")) {
          differences.push(
            `${prefix}.memo expected=${JSON.stringify(expectedLine.memo ?? "")} actual=${JSON.stringify(actualLine.memo ?? "")}`,
          );
        }

        if (
          Math.round(actualLine.inflow * 100) !==
          Math.round(expectedLine.inflow * 100)
        ) {
          differences.push(
            `${prefix}.inflow expected=${expectedLine.inflow} actual=${actualLine.inflow}`,
          );
        }

        if (
          Math.round(actualLine.outflow * 100) !==
          Math.round(expectedLine.outflow * 100)
        ) {
          differences.push(
            `${prefix}.outflow expected=${expectedLine.outflow} actual=${actualLine.outflow}`,
          );
        }

        if (
          actualLine.transferAccountId !==
          expectedLine.transferAccountId
        ) {
          differences.push(
            `${prefix}.transferAccountId expected=${JSON.stringify(expectedLine.transferAccountId)} actual=${JSON.stringify(actualLine.transferAccountId)}`,
          );
        }

        if (
          actualLine.transferTransactionId !==
          expectedLine.transferTransactionId
        ) {
          differences.push(
            `${prefix}.transferTransactionId expected=${JSON.stringify(expectedLine.transferTransactionId)} actual=${JSON.stringify(actualLine.transferTransactionId)}`,
          );
        }
      }
    }

    if (differences.length > 0) {
      throw new Error(
        `Committed import transaction ${transaction.id} differs from the reviewed commit plan: ${differences.join("; ")}.`,
      );
    }
  }
}
