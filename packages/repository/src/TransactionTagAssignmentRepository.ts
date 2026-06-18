import { TransactionTagAssignment } from "../../types/src/TransactionTagAssignment.js";

export interface TransactionTagAssignmentRepository {
  create(item: TransactionTagAssignment): Promise<void>;
  update?(item: TransactionTagAssignment): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteByTransactionAndTag(
    transactionId: string,
    tagId: string,
  ): Promise<void>;
  deleteByTagId(tagId: string): Promise<void>;
  findByTransactionId(
    transactionId: string,
  ): Promise<TransactionTagAssignment[]>;
  findByTagId(tagId: string): Promise<TransactionTagAssignment[]>;
}
