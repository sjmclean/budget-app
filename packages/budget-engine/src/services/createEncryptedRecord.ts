import { randomUUID } from "crypto";
import { EncryptedRecord } from "../../../types/src/EncryptedRecord.js";
import { encryptPayload, decryptPayload } from "../../../security/src/encryptedPayloads.js";

export interface CreateEncryptedRecordInput {
  budgetId: string;
  entityType: string;
  entityId: string;
  keyVersion: number;
  plainObject: unknown;
  key: Buffer;
}

export function createEncryptedRecord(input: CreateEncryptedRecordInput): EncryptedRecord {
  const now = new Date();
  const encrypted = encryptPayload(JSON.stringify(input.plainObject), input.key);

  return {
    id: randomUUID(),
    budgetId: input.budgetId,
    entityType: input.entityType,
    entityId: input.entityId,
    keyVersion: input.keyVersion,
    nonce: encrypted.nonce,
    authTag: encrypted.authTag,
    cipherText: encrypted.cipherText,
    createdAt: now,
    updatedAt: now
  };
}

export function decryptEncryptedRecord<T>(
  record: EncryptedRecord,
  key: Buffer
): T {
  const plainText = decryptPayload(
    {
      nonce: record.nonce,
      authTag: record.authTag,
      cipherText: record.cipherText
    },
    key
  );

  return JSON.parse(plainText) as T;
}
