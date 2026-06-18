import { eq } from "drizzle-orm";
import { splitTransactionLines } from "../../database/src/schema.js";
import { SplitTransactionLine } from "../../types/src/SplitTransactionLine.js";
import { SplitTransactionLineRepository } from "./SplitTransactionLineRepository.js";

export class SqliteSplitTransactionLineRepository implements SplitTransactionLineRepository {
  constructor(private db: any) {}

  async create(line: SplitTransactionLine): Promise<void> {
    await this.db.insert(splitTransactionLines).values(line);
  }

  async createMany(lines: SplitTransactionLine[]): Promise<void> {
    for (const line of lines) {
      await this.create(line);
    }
  }

  async findByTransaction(transactionId: string): Promise<SplitTransactionLine[]> {
    return await this.db
      .select()
      .from(splitTransactionLines)
      .where(eq(splitTransactionLines.transactionId, transactionId));
  }
}
