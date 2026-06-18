export type CommandHistoryStatus = "done" | "undone";

export interface CommandHistoryEntry {
  id: string;
  budgetId: string;
  eventId: string | null;
  commandType: string;
  entityType: string;
  entityId: string;
  undoPayloadJson: string;
  redoPayloadJson: string;
  status: CommandHistoryStatus;
  createdAt: Date;
  executedAt: Date;
  undoneAt: Date | null;
  redoneAt: Date | null;
}
