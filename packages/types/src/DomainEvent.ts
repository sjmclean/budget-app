import { DomainEventType } from "./DomainEventType.js";

export interface DomainEvent {
  id: string;
  budgetId: string;
  type: DomainEventType;
  entityId: string | null;
  occurredAt: Date;
  payloadJson: string;
}
