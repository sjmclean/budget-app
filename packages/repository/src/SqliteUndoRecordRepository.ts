import { eq } from "drizzle-orm";
import { undoRecords } from "../../database/src/schema.js";
import { UndoRecord } from "../../types/src/UndoRecord.js";
import { UndoRecordRepository } from "./UndoRecordRepository.js";

export class SqliteUndoRecordRepository implements UndoRecordRepository {
  constructor(private db: any) {}

  async create(record: UndoRecord): Promise<void> {
    await this.db.insert(undoRecords).values(record);
  }

  async findByBudget(budgetId: string): Promise<UndoRecord[]> {
    return await this.db.select().from(undoRecords).where(eq(undoRecords.budgetId, budgetId));
  }
}
