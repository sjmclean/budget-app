import { randomUUID } from "crypto";
import { DomainEvent } from "../../types/src/DomainEvent.js";
import { DomainEventType } from "../../types/src/DomainEventType.js";
import { DomainEventRepository } from "../../repository/src/DomainEventRepository.js";

export interface AuditEventInput {
  budgetId: string;
  type: DomainEventType;
  entityId?: string | null;
  payload?: unknown;
}

export class AuditApplicationService {
  constructor(private eventRepo: DomainEventRepository) {}

  async record(input: AuditEventInput): Promise<DomainEvent> {
    const event: DomainEvent = {
      id: randomUUID(),
      budgetId: input.budgetId,
      type: input.type,
      entityId: input.entityId ?? null,
      occurredAt: new Date(),
      payloadJson: JSON.stringify(input.payload ?? {})
    };
    await this.eventRepo.append(event);
    return event;
  }

  async history(budgetId: string): Promise<DomainEvent[]> {
    return await this.eventRepo.findByBudget(budgetId);
  }
}
