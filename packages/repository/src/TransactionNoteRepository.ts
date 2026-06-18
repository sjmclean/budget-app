import { TransactionNote } from "../../types/src/TransactionNote.js";

export interface TransactionNoteRepository {
  create(item: TransactionNote): Promise<void>;
  update(item: TransactionNote): Promise<void>;
  deleteById(id: string): Promise<void>;
  findByTransactionId(transactionId: string): Promise<TransactionNote[]>;
}
