import { CommandHistoryEntry } from "../../types/src/CommandHistoryEntry.js";

export interface CommandHistoryRepository {
  create(entry: CommandHistoryEntry): Promise<void>;
  update(entry: CommandHistoryEntry): Promise<void>;
  findByBudget(budgetId: string): Promise<CommandHistoryEntry[]>;
  getById(id: string): Promise<CommandHistoryEntry | null>;
}
