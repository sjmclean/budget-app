import { randomUUID } from "crypto";
import { DomainEvent } from "../../types/src/DomainEvent.js";
import { UndoRecord } from "../../types/src/UndoRecord.js";
import { DomainEventRepository } from "../../repository/src/DomainEventRepository.js";

export class UndoService {
  constructor(private eventRepo: DomainEventRepository) {}

  createUndoRecord(
    budgetId: string,
    event: DomainEvent,
    reversePayload: unknown
  ): UndoRecord {
    return {
      id: randomUUID(),
      budgetId,
      eventId: event.id,
      reverseEventPayloadJson: JSON.stringify(reversePayload),
      createdAt: new Date()
    };
  }

  async getLastEvent(budgetId: string): Promise<DomainEvent | null> {
    const events = await this.eventRepo.findByBudget(budgetId);
    return events[events.length - 1] ?? null;
  }
}
