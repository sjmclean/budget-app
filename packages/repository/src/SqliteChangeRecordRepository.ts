import { eq } from "drizzle-orm";
import { changeRecords } from "../../database/src/schema.js";
import { ChangeRecord } from "../../types/src/ChangeRecord.js";
import { ChangeRecordRepository } from "./ChangeRecordRepository.js";

export class SqliteChangeRecordRepository implements ChangeRecordRepository {
  constructor(private db: any) {}

  async create(record: ChangeRecord): Promise<void> {
    await this.db.insert(changeRecords).values(record);
  }

  async findByBudget(budgetId: string): Promise<ChangeRecord[]> {
    return await this.db
      .select()
      .from(changeRecords)
      .where(eq(changeRecords.budgetId, budgetId));
  }

  async findByDevice(deviceId: string): Promise<ChangeRecord[]> {
    return await this.db
      .select()
      .from(changeRecords)
      .where(eq(changeRecords.deviceId, deviceId));
  }
}
