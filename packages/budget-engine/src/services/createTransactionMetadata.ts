import { randomUUID } from "crypto";
import {
  TransactionFlag,
  TransactionFlagColour,
} from "../../../types/src/TransactionFlag.js";
import { TransactionNote } from "../../../types/src/TransactionNote.js";
import { TransactionTag } from "../../../types/src/TransactionTag.js";
import { TransactionTagAssignment } from "../../../types/src/TransactionTagAssignment.js";

export function createTransactionFlag(
  transactionId: string,
  colour: TransactionFlagColour,
  label: string | null = null,
): TransactionFlag {
  return {
    id: randomUUID(),
    transactionId,
    colour,
    label,
    createdAt: new Date(),
  };
}

export function createTransactionNote(
  transactionId: string,
  note: string,
): TransactionNote {
  const now = new Date();

  return {
    id: randomUUID(),
    transactionId,
    note,
    createdAt: now,
    updatedAt: now,
  };
}

export function createTransactionTag(
  budgetId: string,
  name: string,
  colour: string | null = null,
): TransactionTag {
  return {
    id: randomUUID(),
    budgetId,
    name,
    colour,
    createdAt: new Date(),
  };
}

export function assignTransactionTag(
  transactionId: string,
  tagId: string,
): TransactionTagAssignment {
  return {
    id: randomUUID(),
    transactionId,
    tagId,
    createdAt: new Date(),
  };
}
