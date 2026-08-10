import { decodeYnabAmount } from "../money/decodeYnabAmount.js";
import type {
  ImportReadOptions,
  ImportSession,
  ImportSourceValidationResult,
} from "./importSource.js";
import type {
  Ynab4SmallCollections,
  Ynab4SourceMetadata,
  Ynab4SourceTransaction,
} from "./types.js";

export type Ynab4StreamingPreflightIssue = {
  readonly code: string;
  readonly message: string;
  readonly recordIndex?: number;
};

export type Ynab4StreamingPreflightResult = {
  readonly format: "ynab4-json";
  readonly transactionsValidated: number;
  readonly transferReferencesSeen: number;
  readonly duplicateTransactionIds: number;
};

type TransactionStub = {
  readonly accountId: string;
  readonly targetAccountId: string | null;
  readonly amount: number;
  readonly pairedId: string | null;
};

/**
 * Incremental Phase-2 preflight. It validates reference identities and each
 * transaction batch without retaining transaction objects. Only transaction
 * IDs and small transfer-pair stubs survive between batches.
 */
export class Ynab4StreamingPreflightSession
  implements ImportSession<
    Ynab4SourceMetadata,
    Ynab4SmallCollections,
    Ynab4SourceTransaction,
    number,
    Ynab4StreamingPreflightResult,
    Ynab4StreamingPreflightIssue
  >
{
  private accountIds = new Set<string>();
  private payeeIds = new Set<string>();
  private transferPayeeIds = new Set<string>();
  private categoryIds = new Set<string>();
  private transactionIds = new Set<string>();
  private transferStubs = new Map<string, TransactionStub>();
  private transactionsValidated = 0;
  private transferReferencesSeen = 0;
  private duplicateTransactionIds = 0;
  private begun = false;
  private committed = false;

  async validateSource(
    summary: Ynab4SourceMetadata,
    referenceData: Ynab4SmallCollections,
    options: ImportReadOptions = {},
  ): Promise<ImportSourceValidationResult<Ynab4StreamingPreflightIssue>> {
    options.signal?.throwIfAborted();
    const issues: Ynab4StreamingPreflightIssue[] = [];
    if (summary.format !== "ynab4-json") {
      issues.push({ code: "YNAB4_FORMAT", message: "Expected a YNAB4 JSON source." });
    }
    collectUniqueIds(referenceData.accounts, this.accountIds, "account", issues);
    collectPayeeIds(referenceData.payees, this.payeeIds, this.transferPayeeIds, issues);
    for (const group of referenceData.masterCategories) {
      collectUniqueIds(toRecords(group.subCategories), this.categoryIds, "category", issues);
    }
    if (this.accountIds.size === 0) {
      issues.push({ code: "YNAB4_ACCOUNTS_MISSING", message: "YNAB4 source contains no identifiable accounts." });
    }
    return { valid: issues.length === 0, issues };
  }

  async begin(): Promise<void> {
    if (this.begun) throw new Error("YNAB4 streaming preflight has already begun.");
    this.begun = true;
  }

  async persistBatch(
    records: readonly Ynab4SourceTransaction[],
    options: ImportReadOptions = {},
  ): Promise<number> {
    if (!this.begun || this.committed) throw new Error("YNAB4 streaming preflight is not writable.");
    let accepted = 0;
    for (const record of records) {
      options.signal?.throwIfAborted();
      const recordIndex = this.transactionsValidated;
      if (!isYnab4Tombstone(record)) {
        this.validateTransactionRecord(record, recordIndex, null);
        const parentAccountId = firstString(
          record.accountId,
          record.accountEntityId,
        );
        for (const subTransaction of toRecords(record.subTransactions)) {
          if (isYnab4Tombstone(subTransaction)) continue;
          this.validateTransactionRecord(
            subTransaction,
            recordIndex,
            parentAccountId,
          );
        }
      }
      this.transactionsValidated += 1;
      accepted += 1;
    }
    return accepted;
  }

  private validateTransactionRecord(
    record: Ynab4SourceTransaction,
    recordIndex: number,
    inheritedAccountId: string | null,
  ): void {
      const id = firstString(record.entityId, record.id, record.transactionId);
      if (!id) throw issueError("YNAB4_TRANSACTION_ID", "Transaction is missing an identity.", recordIndex);
      if (this.transactionIds.has(id)) {
        this.duplicateTransactionIds += 1;
        throw issueError("YNAB4_TRANSACTION_DUPLICATE", `Duplicate transaction identity "${id}".`, recordIndex);
      }
      const accountId =
        firstString(record.accountId, record.accountEntityId) ??
        inheritedAccountId;
      if (!accountId || !this.accountIds.has(accountId)) {
        throw issueError("YNAB4_TRANSACTION_ACCOUNT", `Transaction "${id}" has an unresolved account reference.`, recordIndex);
      }
      const amount = decodeYnabAmount({
        amount: record.amount,
        amountMilliUnits: record.amountMilliUnits,
        inflow: record.inflow,
        outflow: record.outflow,
      });
      if (amount === null) throw issueError("YNAB4_TRANSACTION_AMOUNT", `Transaction "${id}" has no valid amount.`, recordIndex);
      const categoryId = firstString(record.categoryId, record.subCategoryId);
      if (categoryId && isOrdinaryCategory(categoryId) && !this.categoryIds.has(categoryId)) {
        throw issueError("YNAB4_TRANSACTION_CATEGORY", `Transaction "${id}" has an unresolved category reference.`, recordIndex);
      }
      const payeeId = firstString(record.payeeId);
      if (
        payeeId &&
        !this.payeeIds.has(payeeId) &&
        !this.transferPayeeIds.has(payeeId) &&
        !firstString(record.targetAccountId, record.transferAccountId)
      ) {
        // Transfer payees are intentionally absent from the ordinary payee map.
        // A direct transfer account reference is therefore accepted.
        throw issueError("YNAB4_TRANSACTION_PAYEE", `Transaction "${id}" has an unresolved payee reference.`, recordIndex);
      }

      const pairedId = firstString(record.transferTransactionId);
      this.transactionIds.add(id);
      if (pairedId) {
        this.transferReferencesSeen += 1;
        this.transferStubs.set(id, {
          accountId,
          targetAccountId: firstString(
            record.targetAccountId,
            record.transferAccountId,
          ),
          amount,
          pairedId,
        });
      }
  }

  async commit(): Promise<Ynab4StreamingPreflightResult> {
    if (!this.begun || this.committed) throw new Error("YNAB4 streaming preflight cannot commit.");
    for (const [id, stub] of this.transferStubs) {
      const pair = stub.pairedId ? this.transferStubs.get(stub.pairedId) : undefined;
      if (
        !pair ||
        pair.pairedId !== id ||
        pair.accountId === stub.accountId ||
        (stub.targetAccountId !== null &&
          stub.targetAccountId !== pair.accountId) ||
        (pair.targetAccountId !== null &&
          pair.targetAccountId !== stub.accountId) ||
        roundMoney(stub.amount + pair.amount) !== 0
      ) {
        throw issueError("YNAB4_TRANSFER_PAIR", `Transfer transaction "${id}" does not have a valid reciprocal pair.`);
      }
    }
    this.committed = true;
    return {
      format: "ynab4-json",
      transactionsValidated: this.transactionsValidated,
      transferReferencesSeen: this.transferReferencesSeen,
      duplicateTransactionIds: this.duplicateTransactionIds,
    };
  }

  async rollback(): Promise<void> {
    this.transactionIds.clear();
    this.transferStubs.clear();
    this.transactionsValidated = 0;
    this.transferReferencesSeen = 0;
    this.begun = false;
  }

  async close(): Promise<void> {
    this.accountIds.clear();
    this.payeeIds.clear();
    this.transferPayeeIds.clear();
    this.categoryIds.clear();
    this.transactionIds.clear();
    this.transferStubs.clear();
  }
}

function collectPayeeIds(
  records: readonly Record<string, unknown>[],
  ordinary: Set<string>,
  transfers: Set<string>,
  issues: Ynab4StreamingPreflightIssue[],
): void {
  for (const [index, record] of records.entries()) {
    const id = firstString(record.entityId, record.id, record.payeeId);
    if (!id) {
      issues.push({ code: "YNAB4_PAYEE_ID", message: `payee ${index} is missing an identity.` });
      continue;
    }
    if (ordinary.has(id) || transfers.has(id)) {
      issues.push({ code: "YNAB4_PAYEE_DUPLICATE", message: `Duplicate payee identity "${id}".` });
      continue;
    }
    if (firstString(record.targetAccountId, record.transferAccountId)) transfers.add(id);
    else ordinary.add(id);
  }
}

function collectUniqueIds(
  records: readonly Record<string, unknown>[],
  target: Set<string>,
  label: string,
  issues: Ynab4StreamingPreflightIssue[],
): void {
  for (const [index, record] of records.entries()) {
    const id = firstString(record.entityId, record.id, record[`${label}Id`]);
    if (!id) {
      issues.push({ code: `YNAB4_${label.toUpperCase()}_ID`, message: `${label} ${index} is missing an identity.` });
    } else if (target.has(id)) {
      issues.push({ code: `YNAB4_${label.toUpperCase()}_DUPLICATE`, message: `Duplicate ${label} identity "${id}".` });
    } else {
      target.add(id);
    }
  }
}

function issueError(code: string, message: string, recordIndex?: number): Error {
  const error = new Error(message) as Error & { issue: Ynab4StreamingPreflightIssue };
  error.name = "Ynab4StreamingPreflightError";
  error.issue = { code, message, ...(recordIndex === undefined ? {} : { recordIndex }) };
  return error;
}

function isOrdinaryCategory(id: string): boolean {
  return !id.startsWith("Category/__");
}

function isYnab4Tombstone(record: Record<string, unknown>): boolean {
  return (
    record.isTombstone === true ||
    record.isDeleted === true ||
    record.deleted === true
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function toRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> =>
        entry !== null && typeof entry === "object" && !Array.isArray(entry))
    : [];
}
