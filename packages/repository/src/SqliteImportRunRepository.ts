import { eq } from "drizzle-orm";
import { importRuns } from "../../database/src/schema.js";
import { ImportRun } from "../../types/src/ImportRun.js";
import { ImportRunRepository } from "./ImportRunRepository.js";

export class SqliteImportRunRepository implements ImportRunRepository {
  constructor(private db: any) {}

  async create(item: ImportRun): Promise<void> {
    await this.db.insert(importRuns).values(item);
  }

  async update(item: ImportRun): Promise<void> {
    await this.db
      .update(importRuns)
      .set(item)
      .where(eq(importRuns.id, item.id));
  }

  async findByBudgetId(budgetId: string): Promise<ImportRun[]> {
    return await this.db
      .select()
      .from(importRuns)
      .where(eq(importRuns.budgetId, budgetId));
  }
}
