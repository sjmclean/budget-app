import { eq } from "drizzle-orm";
import { transactionNotes } from "../../database/src/schema.js";
import { TransactionNote } from "../../types/src/TransactionNote.js";
import { TransactionNoteRepository } from "./TransactionNoteRepository.js";

export class SqliteTransactionNoteRepository implements TransactionNoteRepository {
  constructor(private db: any) {}

  async create(item: TransactionNote): Promise<void> {
    await this.db.insert(transactionNotes).values(item);
  }
  async update(item: TransactionNote): Promise<void> {
    await this.db
      .update(transactionNotes)
      .set(item)
      .where(eq(transactionNotes.id, item.id));
  }
  async deleteById(id: string): Promise<void> {
    await this.db.delete(transactionNotes).where(eq(transactionNotes.id, id));
  }
  async findByTransactionId(transactionId: string): Promise<TransactionNote[]> {
    return await this.db
      .select()
      .from(transactionNotes)
      .where(eq(transactionNotes.transactionId, transactionId));
  }
}
