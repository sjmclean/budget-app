import { DomainEvent } from "../../types/src/DomainEvent.js";
import { DomainEventRepository } from "../../repository/src/DomainEventRepository.js";

export class HistoryService {
  constructor(private eventRepo: DomainEventRepository) {}

  async getHistory(budgetId: string): Promise<DomainEvent[]> {
    return await this.eventRepo.findByBudget(budgetId);
  }

  async describeHistory(budgetId: string): Promise<string[]> {
    const events = await this.getHistory(budgetId);

    return events.map((event) =>
      `${event.occurredAt.toISOString()} ${event.type} ${event.entityId ?? ""}`.trim(),
    );
  }
}
