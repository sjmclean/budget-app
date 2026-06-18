import { eq } from "drizzle-orm";
import { domainEvents } from "../../database/src/schema.js";
import { DomainEvent } from "../../types/src/DomainEvent.js";
import { DomainEventRepository } from "./DomainEventRepository.js";

export class SqliteDomainEventRepository implements DomainEventRepository {
  constructor(private db: any) {}

  async append(event: DomainEvent): Promise<void> {
    await this.db.insert(domainEvents).values(event);
  }

  async findByBudget(budgetId: string): Promise<DomainEvent[]> {
    return await this.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.budgetId, budgetId));
  }
}
