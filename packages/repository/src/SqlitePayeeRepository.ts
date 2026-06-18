import { and, eq, like } from "drizzle-orm";
import { payees } from "../../database/src/schema.js";
import { Payee } from "../../types/src/Payee.js";
import { PayeeRepository } from "./PayeeRepository.js";

export class SqlitePayeeRepository implements PayeeRepository {
  constructor(private db: any) {}

  async create(payee: Payee): Promise<void> {
    const now = new Date();
    await this.db.insert(payees).values({
      id: payee.id,
      budgetId: payee.budgetId,
      name: payee.name,
      normalizedName: payee.normalizedName ?? payee.name.trim().toLowerCase(),
      isArchived: payee.isArchived ?? false,
      isTransfer: payee.isTransfer ?? false,
      transferAccountId: payee.transferAccountId ?? null,
      createdAt: payee.createdAt ?? now,
      updatedAt: payee.updatedAt ?? now,
    });
  }

  async update(payee: Payee): Promise<void> {
    await this.db
      .update(payees)
      .set({
        name: payee.name,
        normalizedName: payee.normalizedName ?? payee.name.trim().toLowerCase(),
        isArchived: payee.isArchived ?? false,
        isTransfer: payee.isTransfer ?? false,
        transferAccountId: payee.transferAccountId ?? null,
        updatedAt: payee.updatedAt ?? new Date(),
      })
      .where(eq(payees.id, payee.id));
  }

  async archive(payeeId: string): Promise<void> {
    await this.db
      .update(payees)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(payees.id, payeeId));
  }

  async delete(payeeId: string): Promise<void> {
    await this.db.delete(payees).where(eq(payees.id, payeeId));
  }

  async findById(payeeId: string): Promise<Payee | null> {
    const rows = await this.db
      .select()
      .from(payees)
      .where(eq(payees.id, payeeId));
    return rows[0] ?? null;
  }

  async findByBudget(budgetId: string): Promise<Payee[]> {
    return await this.db
      .select()
      .from(payees)
      .where(eq(payees.budgetId, budgetId));
  }

  async findActiveByBudget(budgetId: string): Promise<Payee[]> {
    return await this.db
      .select()
      .from(payees)
      .where(and(eq(payees.budgetId, budgetId), eq(payees.isArchived, false)));
  }

  async findByNormalizedName(
    budgetId: string,
    normalizedName: string,
  ): Promise<Payee | null> {
    const rows = await this.db
      .select()
      .from(payees)
      .where(
        and(
          eq(payees.budgetId, budgetId),
          eq(payees.normalizedName, normalizedName),
        ),
      );
    return rows[0] ?? null;
  }

  async search(budgetId: string, query: string): Promise<Payee[]> {
    const normalizedQuery = `%${query.trim().toLowerCase()}%`;
    return await this.db
      .select()
      .from(payees)
      .where(
        and(
          eq(payees.budgetId, budgetId),
          like(payees.normalizedName, normalizedQuery),
        ),
      );
  }
}
