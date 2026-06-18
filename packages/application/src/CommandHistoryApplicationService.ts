/**
 * Command history / undo preview service.
 *
 * The app records reversible user actions as command history entries. At this stage the
 * service focuses on storing and previewing undo records; full command replay/redo can
 * build on the same structure once the GUI starts exposing undo controls.
 */
import { DomainEvent } from "../../types/src/DomainEvent.js";
import { UndoRecord } from "../../types/src/UndoRecord.js";
import { DomainEventRepository } from "../../repository/src/DomainEventRepository.js";
import { UndoRecordRepository } from "../../repository/src/UndoRecordRepository.js";

export interface UndoPreview {
  undoRecord: UndoRecord;
  event: DomainEvent | null;
  reversePayload: unknown;
}

export class CommandHistoryApplicationService {
  constructor(private undoRepo: UndoRecordRepository, private eventRepo: DomainEventRepository) {}

  async getUndoStack(budgetId: string): Promise<UndoRecord[]> {
    const records = await this.undoRepo.findByBudget(budgetId);
    return records.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async previewUndo(budgetId: string): Promise<UndoPreview | null> {
    const records = await this.getUndoStack(budgetId);
    const undoRecord = records[records.length - 1];
    if (!undoRecord) return null;
    const events = await this.eventRepo.findByBudget(budgetId);
    const event = events.find((item) => item.id === undoRecord.eventId) ?? null;
    return { undoRecord, event, reversePayload: JSON.parse(undoRecord.reverseEventPayloadJson) };
  }
}
