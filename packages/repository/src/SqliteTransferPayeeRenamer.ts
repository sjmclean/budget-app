import { eq } from "drizzle-orm";
import { payees } from "../../database/src/schema.js";

export class SqliteTransferPayeeRenamer {
  constructor(private db: any) {}

  async updateTransferPayeeNamesForAccount(accountId: string, payeeName: string): Promise<void> {
    await this.db
      .update(payees)
      .set({ name: payeeName, normalizedName: payeeName.trim().toLowerCase(), updatedAt: new Date() })
      .where(eq(payees.transferAccountId, accountId));
  }
}
