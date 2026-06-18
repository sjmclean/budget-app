import { DomainEvent } from "../../types/src/DomainEvent.js";

export interface DomainEventRepository {
  append(event: DomainEvent): Promise<void>;
  findByBudget(budgetId: string): Promise<DomainEvent[]>;
}
