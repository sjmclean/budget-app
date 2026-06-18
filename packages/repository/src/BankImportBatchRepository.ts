import type { BankImportBatch } from "../../types/src/index.js";

export interface BankImportBatchItem {
  id: string;
  batchId: string;
  transactionId: string;
  externalId: string | null;
  rawPayee: string;
  amount: number;
  date: string;
  createdAt: Date;
}

export interface BankImportBatchRepository {
  createBatch(batch: BankImportBatch): Promise<void>;
  addItem(item: BankImportBatchItem): Promise<void>;
  getBatch(batchId: string): Promise<BankImportBatch | null>;
  findItems(batchId: string): Promise<BankImportBatchItem[]>;
  markUndone(batchId: string, undoneAt: Date): Promise<void>;
}
