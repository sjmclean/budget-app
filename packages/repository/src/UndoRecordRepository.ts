import { UndoRecord } from "../../types/src/UndoRecord.js";

export interface UndoRecordRepository {
  create(record: UndoRecord): Promise<void>;
  findByBudget(budgetId: string): Promise<UndoRecord[]>;
}
