import { eq } from "drizzle-orm";
import { reconciliations } from "../../database/src/schema.js";
import { Reconciliation } from "../../types/src/Reconciliation.js";
import { ReconciliationRepository } from "./ReconciliationRepository.js";

export class SqliteReconciliationRepository implements ReconciliationRepository {
  constructor(private db: any) {}
  async create(reconciliation: Reconciliation): Promise<void> {
    await this.db.insert(reconciliations).values(reconciliation);
  }
  async findByAccount(accountId: string): Promise<Reconciliation[]> {
    return await this.db
      .select()
      .from(reconciliations)
      .where(eq(reconciliations.accountId, accountId));
  }
}
