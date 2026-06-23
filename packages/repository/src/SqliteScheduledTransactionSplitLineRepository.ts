import { eq } from "drizzle-orm";
import { scheduledTransactionSplitLines } from "../../database/src/schema.js";
import { ScheduledTransactionSplitLine } from "../../types/src/ScheduledTransactionSplitLine.js";
import { ScheduledTransactionSplitLineRepository } from "./ScheduledTransactionSplitLineRepository.js";

export class SqliteScheduledTransactionSplitLineRepository implements ScheduledTransactionSplitLineRepository {
  constructor(private db: any) {}

  async create(line: ScheduledTransactionSplitLine): Promise<void> {
    await this.db.insert(scheduledTransactionSplitLines).values(line);
  }

  async createMany(lines: ScheduledTransactionSplitLine[]): Promise<void> {
    for (const line of lines) {
      await this.create(line);
    }
  }

  async findByScheduledTransaction(scheduledTransactionId: string): Promise<ScheduledTransactionSplitLine[]> {
    return await this.db
      .select()
      .from(scheduledTransactionSplitLines)
      .where(eq(scheduledTransactionSplitLines.scheduledTransactionId, scheduledTransactionId));
  }
}
