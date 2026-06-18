import { ImportRun } from "../../types/src/ImportRun.js";

export interface ImportRunRepository {
  create(item: ImportRun): Promise<void>;
  update?(item: ImportRun): Promise<void>;
  findByBudgetId(budgetId: string): Promise<ImportRun[]>;
}
