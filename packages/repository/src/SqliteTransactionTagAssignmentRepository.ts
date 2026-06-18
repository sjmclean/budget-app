import { and, eq } from "drizzle-orm";
import { transactionTagAssignments } from "../../database/src/schema.js";
import { TransactionTagAssignment } from "../../types/src/TransactionTagAssignment.js";
import { TransactionTagAssignmentRepository } from "./TransactionTagAssignmentRepository.js";

export class SqliteTransactionTagAssignmentRepository implements TransactionTagAssignmentRepository {
  constructor(private db: any) {}

  async create(item: TransactionTagAssignment): Promise<void> {
    await this.db.insert(transactionTagAssignments).values(item);
  }
  async update(item: TransactionTagAssignment): Promise<void> {
    await this.db
      .update(transactionTagAssignments)
      .set(item)
      .where(eq(transactionTagAssignments.id, item.id));
  }
  async deleteById(id: string): Promise<void> {
    await this.db
      .delete(transactionTagAssignments)
      .where(eq(transactionTagAssignments.id, id));
  }
  async deleteByTransactionAndTag(
    transactionId: string,
    tagId: string,
  ): Promise<void> {
    await this.db
      .delete(transactionTagAssignments)
      .where(
        and(
          eq(transactionTagAssignments.transactionId, transactionId),
          eq(transactionTagAssignments.tagId, tagId),
        ),
      );
  }
  async deleteByTagId(tagId: string): Promise<void> {
    await this.db
      .delete(transactionTagAssignments)
      .where(eq(transactionTagAssignments.tagId, tagId));
  }
  async findByTransactionId(
    transactionId: string,
  ): Promise<TransactionTagAssignment[]> {
    return await this.db
      .select()
      .from(transactionTagAssignments)
      .where(eq(transactionTagAssignments.transactionId, transactionId));
  }
  async findByTagId(tagId: string): Promise<TransactionTagAssignment[]> {
    return await this.db
      .select()
      .from(transactionTagAssignments)
      .where(eq(transactionTagAssignments.tagId, tagId));
  }
}
