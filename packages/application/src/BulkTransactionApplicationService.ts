import { ClearedStatus } from "../../types/src/ClearedStatus.js";
import { Transaction } from "../../types/src/Transaction.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";

export interface BulkTransactionChangeInput {
  transactionIds: string[];
  clearedStatus?: ClearedStatus;
  flagColour?: string | null;
  categoryId?: string | null;
  payeeId?: string | null;
  forceReconciledEdit?: boolean;
}

export interface BulkTransactionResult {
  updated: string[];
  skipped: { transactionId: string; reason: string }[];
}

export class BulkTransactionApplicationService {
  constructor(private transactionRepo: TransactionRepository) {}

  private async applyChange(
    transaction: Transaction,
    input: BulkTransactionChangeInput,
  ): Promise<Transaction> {
    if (
      transaction.clearedStatus === ClearedStatus.Reconciled &&
      !input.forceReconciledEdit
    ) {
      throw new Error(
        "Reconciled transactions require explicit override before bulk editing",
      );
    }
    return {
      ...transaction,
      clearedStatus: input.clearedStatus ?? transaction.clearedStatus,
      categoryId:
        input.categoryId !== undefined
          ? input.categoryId
          : transaction.categoryId,
      payeeId:
        input.payeeId !== undefined ? input.payeeId : transaction.payeeId,
      updatedAt: new Date(),
    };
  }

  async bulkUpdate(
    input: BulkTransactionChangeInput,
  ): Promise<BulkTransactionResult> {
    const updated: string[] = [];
    const skipped: { transactionId: string; reason: string }[] = [];
    for (const id of input.transactionIds) {
      const transaction = await this.transactionRepo.getById(id);
      if (!transaction) {
        skipped.push({ transactionId: id, reason: "Transaction not found" });
        continue;
      }
      try {
        const next = await this.applyChange(transaction, input);
        await this.transactionRepo.update(next);
        updated.push(id);
      } catch (error: any) {
        skipped.push({
          transactionId: id,
          reason: error.message ?? String(error),
        });
      }
    }
    return { updated, skipped };
  }

  async bulkDelete(
    transactionIds: string[],
    forceReconciledDelete = false,
  ): Promise<BulkTransactionResult> {
    const updated: string[] = [];
    const skipped: { transactionId: string; reason: string }[] = [];
    for (const id of transactionIds) {
      const transaction = await this.transactionRepo.getById(id);
      if (!transaction) {
        skipped.push({ transactionId: id, reason: "Transaction not found" });
        continue;
      }
      if (
        transaction.clearedStatus === ClearedStatus.Reconciled &&
        !forceReconciledDelete
      ) {
        skipped.push({
          transactionId: id,
          reason:
            "Reconciled transactions require explicit override before bulk deleting",
        });
        continue;
      }
      await this.transactionRepo.softDelete(id);
      updated.push(id);
    }
    return { updated, skipped };
  }
}
