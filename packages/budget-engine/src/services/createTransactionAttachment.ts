import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { AttachmentStorageType } from "../../../types/src/AttachmentStorageType.js";
import { TransactionAttachment } from "../../../types/src/TransactionAttachment.js";

export interface CreateTransactionAttachmentInput {
  budgetId: string;
  transactionId: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  relativePath: string;
  content: Buffer | string;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function hashAttachmentContent(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createTransactionAttachment(
  input: CreateTransactionAttachmentInput
): TransactionAttachment {
  const id = randomUUID();
  const contentHash = hashAttachmentContent(input.content);
  const extension = input.originalFileName.includes(".")
    ? input.originalFileName.slice(input.originalFileName.lastIndexOf("."))
    : "";

  const storedFileName = `${id}${extension}`;
  const shard = contentHash.slice(0, 2);
  const storedRelativePath = `${input.relativePath}/${shard}/${safeFileName(storedFileName)}`;

  return {
    id,
    budgetId: input.budgetId,
    transactionId: input.transactionId,
    originalFileName: input.originalFileName,
    storedFileName,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    storageType: AttachmentStorageType.ExternalFile,
    relativePath: storedRelativePath,
    contentHash,
    createdAt: new Date()
  };
}
