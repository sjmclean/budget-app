import { eq, sql } from "drizzle-orm";
import { transactions } from "../../database/src/schema.js";
import type { TransactionPayeeUpdater } from "../../application/src/PayeeManagementApplicationService.js";

export class SqliteTransactionPayeeUpdater implements TransactionPayeeUpdater {
  constructor(private db: any) {}

  async countByPayee(payeeId: string): Promise<number> {
    const rows = await this.db.select({ count: sql<number>`count(*)` }).from(transactions).where(eq(transactions.payeeId, payeeId));
    return Number(rows[0]?.count ?? 0);
  }

  async replacePayee(fromPayeeId: string, toPayeeId: string): Promise<void> {
    await this.db.update(transactions).set({ payeeId: toPayeeId, updatedAt: new Date() }).where(eq(transactions.payeeId, fromPayeeId));
  }
}
