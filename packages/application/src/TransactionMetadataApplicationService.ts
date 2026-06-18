import { randomUUID } from "crypto";
import { ClearedStatus } from "../../types/src/ClearedStatus.js";
import { Transaction } from "../../types/src/Transaction.js";
import {
  TransactionFlag,
  TransactionFlagColour,
} from "../../types/src/TransactionFlag.js";
import { TransactionNote } from "../../types/src/TransactionNote.js";
import { TransactionTag } from "../../types/src/TransactionTag.js";
import { TransactionTagAssignment } from "../../types/src/TransactionTagAssignment.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";
import { TransactionFlagRepository } from "../../repository/src/TransactionFlagRepository.js";
import { TransactionNoteRepository } from "../../repository/src/TransactionNoteRepository.js";
import { TransactionTagRepository } from "../../repository/src/TransactionTagRepository.js";
import { TransactionTagAssignmentRepository } from "../../repository/src/TransactionTagAssignmentRepository.js";

function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export class TransactionMetadataApplicationService {
  constructor(
    private transactionRepo: TransactionRepository,
    private flagRepo: TransactionFlagRepository,
    private noteRepo: TransactionNoteRepository,
    private tagRepo: TransactionTagRepository,
    private tagAssignmentRepo: TransactionTagAssignmentRepository,
  ) {}

  private async requireTransaction(
    transactionId: string,
  ): Promise<Transaction> {
    const transaction = await this.transactionRepo.getById(transactionId);
    if (!transaction)
      throw new Error(`Transaction not found: ${transactionId}`);
    return transaction;
  }

  async setFlag(
    transactionId: string,
    colour: TransactionFlagColour,
    label: string | null = null,
  ): Promise<TransactionFlag> {
    await this.requireTransaction(transactionId);
    await this.flagRepo.deleteByTransactionId(transactionId);
    const flag: TransactionFlag = {
      id: randomUUID(),
      transactionId,
      colour,
      label: label?.trim() || null,
      createdAt: new Date(),
    };
    await this.flagRepo.create(flag);
    return flag;
  }

  async clearFlag(transactionId: string): Promise<void> {
    await this.requireTransaction(transactionId);
    await this.flagRepo.deleteByTransactionId(transactionId);
  }

  async getFlags(transactionId: string): Promise<TransactionFlag[]> {
    await this.requireTransaction(transactionId);
    return await this.flagRepo.findByTransactionId(transactionId);
  }

  async addNote(transactionId: string, note: string): Promise<TransactionNote> {
    await this.requireTransaction(transactionId);
    const clean = note.trim();
    if (!clean) throw new Error("Transaction note cannot be empty");
    const item: TransactionNote = {
      id: randomUUID(),
      transactionId,
      note: clean,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.noteRepo.create(item);
    return item;
  }

  async editNote(
    note: TransactionNote,
    newText: string,
  ): Promise<TransactionNote> {
    const clean = newText.trim();
    if (!clean) throw new Error("Transaction note cannot be empty");
    const updated = { ...note, note: clean, updatedAt: new Date() };
    await this.noteRepo.update(updated);
    return updated;
  }

  async deleteNote(noteId: string): Promise<void> {
    await this.noteRepo.deleteById(noteId);
  }

  async listNotes(transactionId: string): Promise<TransactionNote[]> {
    await this.requireTransaction(transactionId);
    return await this.noteRepo.findByTransactionId(transactionId);
  }

  async createTag(
    budgetId: string,
    name: string,
    colour: string | null = null,
  ): Promise<TransactionTag> {
    const clean = normalizeTagName(name);
    if (!clean) throw new Error("Tag name cannot be empty");
    const existing = await this.tagRepo.findByBudgetId(budgetId);
    if (existing.some((tag) => tag.name.toLowerCase() === clean.toLowerCase()))
      throw new Error(`Tag already exists: ${clean}`);
    const tag: TransactionTag = {
      id: randomUUID(),
      budgetId,
      name: clean,
      colour,
      createdAt: new Date(),
    };
    await this.tagRepo.create(tag);
    return tag;
  }

  async renameTag(
    tag: TransactionTag,
    newName: string,
  ): Promise<TransactionTag> {
    const clean = normalizeTagName(newName);
    if (!clean) throw new Error("Tag name cannot be empty");
    const updated = { ...tag, name: clean };
    await this.tagRepo.update(updated);
    return updated;
  }

  async deleteTag(tagId: string): Promise<void> {
    await this.tagAssignmentRepo.deleteByTagId(tagId);
    await this.tagRepo.deleteById(tagId);
  }

  async assignTag(
    transactionId: string,
    tagId: string,
  ): Promise<TransactionTagAssignment> {
    await this.requireTransaction(transactionId);
    const tag = await this.tagRepo.findById(tagId);
    if (!tag) throw new Error(`Tag not found: ${tagId}`);
    const existing =
      await this.tagAssignmentRepo.findByTransactionId(transactionId);
    const existingAssignment = existing.find((item) => item.tagId === tagId);
    if (existingAssignment) return existingAssignment;
    const assignment: TransactionTagAssignment = {
      id: randomUUID(),
      transactionId,
      tagId,
      createdAt: new Date(),
    };
    await this.tagAssignmentRepo.create(assignment);
    return assignment;
  }

  async removeTag(transactionId: string, tagId: string): Promise<void> {
    await this.tagAssignmentRepo.deleteByTransactionAndTag(
      transactionId,
      tagId,
    );
  }

  async listTransactionTags(transactionId: string): Promise<TransactionTag[]> {
    await this.requireTransaction(transactionId);
    const assignments =
      await this.tagAssignmentRepo.findByTransactionId(transactionId);
    const tags: TransactionTag[] = [];
    for (const assignment of assignments) {
      const tag = await this.tagRepo.findById(assignment.tagId);
      if (tag) tags.push(tag);
    }
    return tags;
  }

  async setClearedStatus(
    transactionId: string,
    status: ClearedStatus,
  ): Promise<Transaction> {
    const transaction = await this.requireTransaction(transactionId);
    const updated = {
      ...transaction,
      clearedStatus: status,
      updatedAt: new Date(),
    };
    await this.transactionRepo.update(updated);
    return updated;
  }
}
