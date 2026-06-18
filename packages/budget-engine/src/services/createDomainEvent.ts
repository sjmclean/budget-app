import { randomUUID } from "crypto";
import { DomainEvent } from "../../../types/src/DomainEvent.js";
import { DomainEventType } from "../../../types/src/DomainEventType.js";

export function createDomainEvent(
  budgetId: string,
  type: DomainEventType,
  entityId: string | null,
  payload: unknown
): DomainEvent {
  return {
    id: randomUUID(),
    budgetId,
    type,
    entityId,
    occurredAt: new Date(),
    payloadJson: JSON.stringify(payload)
  };
}
