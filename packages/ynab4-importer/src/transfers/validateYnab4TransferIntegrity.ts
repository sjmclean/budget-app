import { decodeYnabAmount } from "../money/decodeYnabAmount.js";

export type Ynab4TransferRecord = Record<string, unknown>;
export type Ynab4TransferImportData = Record<string, unknown>;

interface IndexedTransferRecord {
  record: Ynab4TransferRecord;
  id: string;
  accountId: string | null;
  date: string | null;
}

/**
 * Validates YNAB4 transfer pairs before mapping or persistence.
 *
 * Parent transactions and split subtransactions share the same validation
 * rules. Split rows inherit their parent account and date when those fields
 * are not repeated on the subtransaction.
 */
export function validateYnab4TransferIntegrity(
  data: Ynab4TransferImportData,
): void {
  const indexed = indexTransferRecords([
    ...toRecords(data.transactions),
    ...toRecords(data.scheduledTransactions),
  ]);
  const recordById = new Map(indexed.map((entry) => [entry.id, entry]));
  const errors: string[] = [];

  for (const entry of indexed) {
    const pairedTransactionId = firstString(entry.record.transferTransactionId);
    if (!pairedTransactionId) continue;

    const pair = recordById.get(pairedTransactionId);
    if (!pair) {
      errors.push(
        `${entry.id}: transfer pair ${pairedTransactionId} was not found.`,
      );
      continue;
    }

    const reciprocalId = firstString(pair.record.transferTransactionId);
    if (reciprocalId !== entry.id) {
      errors.push(
        `${entry.id}: transfer pair ${pairedTransactionId} does not link back reciprocally.`,
      );
    }

    const sourceAccountId = entry.accountId;
    const targetAccountId = firstString(
      entry.record.targetAccountId,
      entry.record.transferAccountId,
    );
    const pairAccountId = pair.accountId;
    const pairTargetAccountId = firstString(
      pair.record.targetAccountId,
      pair.record.transferAccountId,
    );

    if (
      !sourceAccountId ||
      !targetAccountId ||
      !pairAccountId ||
      !pairTargetAccountId
    ) {
      errors.push(`${entry.id}: transfer account relationship is incomplete.`);
    } else {
      if (sourceAccountId === targetAccountId) {
        errors.push(
          `${entry.id}: transfer source and target accounts must differ.`,
        );
      }
      if (
        targetAccountId !== pairAccountId ||
        pairTargetAccountId !== sourceAccountId
      ) {
        errors.push(
          `${entry.id}: transfer account relationship does not match its pair.`,
        );
      }
    }

    const amount = decodeTransactionAmount(entry.record);
    const pairAmount = decodeTransactionAmount(pair.record);
    if (
      amount === null ||
      pairAmount === null ||
      roundMoney(amount + pairAmount) !== 0
    ) {
      errors.push(`${entry.id}: transfer amounts are not equal and opposite.`);
    }

    if (entry.date && pair.date && entry.date !== pair.date) {
      errors.push(`${entry.id}: transfer pair dates do not match.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `YNAB4 transfer integrity validation failed:\n- ${errors.join("\n- ")}`,
    );
  }
}

function indexTransferRecords(
  transactions: Ynab4TransferRecord[],
): IndexedTransferRecord[] {
  const indexed: IndexedTransferRecord[] = [];

  for (const transaction of transactions) {
    if (isYnab4Tombstone(transaction)) continue;
    const transactionId = sourceTransactionId(transaction);
    const accountId = firstString(
      transaction.accountId,
      transaction.accountEntityId,
    );
    const date = normaliseDate(
      firstString(
        transaction.date,
        transaction.dateString,
        transaction.acceptedDate,
      ),
    );

    if (transactionId) {
      indexed.push({ record: transaction, id: transactionId, accountId, date });
    }

    for (const subTransaction of toRecords(transaction.subTransactions)) {
      if (isYnab4Tombstone(subTransaction)) continue;
      const subTransactionId = sourceTransactionId(subTransaction);
      if (!subTransactionId) continue;
      indexed.push({
        record: subTransaction,
        id: subTransactionId,
        accountId:
          firstString(
            subTransaction.accountId,
            subTransaction.accountEntityId,
          ) ?? accountId,
        date:
          normaliseDate(
            firstString(
              subTransaction.date,
              subTransaction.dateString,
              subTransaction.acceptedDate,
            ),
          ) ?? date,
      });
    }
  }

  return indexed;
}

function decodeTransactionAmount(record: Ynab4TransferRecord): number | null {
  return decodeYnabAmount({
    amount: record.amount,
    amountMilliUnits: record.amountMilliUnits,
    inflow: record.inflow,
    outflow: record.outflow,
  });
}

function sourceTransactionId(record: Ynab4TransferRecord): string | null {
  return firstString(record.entityId, record.id, record.transactionId);
}

function isYnab4Tombstone(record: Ynab4TransferRecord): boolean {
  return record.isTombstone === true || record.deleted === true;
}

function normaliseDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function toRecords(value: unknown): Ynab4TransferRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Ynab4TransferRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
