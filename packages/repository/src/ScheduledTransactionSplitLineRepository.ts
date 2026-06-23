import { ScheduledTransactionSplitLine } from "../../types/src/ScheduledTransactionSplitLine.js";

export interface ScheduledTransactionSplitLineRepository {
  create(line: ScheduledTransactionSplitLine): Promise<void>;
  createMany(lines: ScheduledTransactionSplitLine[]): Promise<void>;
  findByScheduledTransaction(scheduledTransactionId: string): Promise<ScheduledTransactionSplitLine[]>;
}
