import { ChangeRecord } from "../../types/src/ChangeRecord.js";

export interface ChangeRecordRepository {
  create(record: ChangeRecord): Promise<void>;
  findByBudget(budgetId: string): Promise<ChangeRecord[]>;
  findByDevice(deviceId: string): Promise<ChangeRecord[]>;
}
