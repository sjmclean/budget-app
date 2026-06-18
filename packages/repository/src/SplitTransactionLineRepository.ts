import { SplitTransactionLine } from "../../types/src/SplitTransactionLine.js";

export interface SplitTransactionLineRepository {
  create(line: SplitTransactionLine): Promise<void>;
  createMany(lines: SplitTransactionLine[]): Promise<void>;
  findByTransaction(transactionId: string): Promise<SplitTransactionLine[]>;
}
