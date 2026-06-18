/**
 * Transaction editing lifecycle service.
 *
 * This is deliberately separate from TransactionApplicationService, which creates/posts
 * new transactions. Register screens need lifecycle actions such as edit, soft-delete,
 * restore, and reconciled-transaction guards. Keeping those workflows here makes the
 * rules visible and testable before the GUI starts calling them.
 */
import { Transaction } from "../../types/src/Transaction.js";
import { ClearedStatus } from "../../types/src/ClearedStatus.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";

export interface EditTransactionInput {
  transactionId: string;
  date?: string;
  payeeId?: string | null;
  categoryId?: string | null;
  memo?: string | null;
  amount?: number;
  clearedStatus?: ClearedStatus;
  forceReconciledEdit?: boolean;
}

export class TransactionManagementApplicationService {
  constructor(private transactionRepo: TransactionRepository) {}

  private async requireTransaction(id: string): Promise<Transaction> {
    const transaction = await this.transactionRepo.getById(id);
    if (!transaction) throw new Error(`Transaction not found: ${id}`);
    return transaction;
  }

  async edit(input: EditTransactionInput): Promise<Transaction> {
    const current = await this.requireTransaction(input.transactionId);
    if (
      current.clearedStatus === ClearedStatus.Reconciled &&
      !input.forceReconciledEdit
    ) {
      throw new Error(
        "Reconciled transactions require explicit override before editing",
      );
    }
    const updated: Transaction = {
      ...current,
      date: input.date ?? current.date,
      payeeId: input.payeeId !== undefined ? input.payeeId : current.payeeId,
      categoryId:
        input.categoryId !== undefined ? input.categoryId : current.categoryId,
      memo: input.memo !== undefined ? input.memo : current.memo,
      amount: input.amount !== undefined ? input.amount : current.amount,
      clearedStatus: input.clearedStatus ?? current.clearedStatus,
      updatedAt: new Date(),
    };
    await this.transactionRepo.update(updated);
    return updated;
  }

  async delete(
    transactionId: string,
    forceReconciledDelete = false,
  ): Promise<void> {
    const current = await this.requireTransaction(transactionId);
    if (
      current.clearedStatus === ClearedStatus.Reconciled &&
      !forceReconciledDelete
    ) {
      throw new Error(
        "Reconciled transactions require explicit override before deleting",
      );
    }
    await this.transactionRepo.softDelete(transactionId);
  }

  async restore(transactionId: string): Promise<void> {
    await this.requireTransaction(transactionId);
    await this.transactionRepo.restore(transactionId);
  }
}
