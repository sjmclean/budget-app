import { AttachmentStorageType } from "./AttachmentStorageType.js";

export interface TransactionAttachment {
  id: string;
  budgetId: string;
  transactionId: string;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  fileSize: number;
  storageType: AttachmentStorageType;
  relativePath: string;
  contentHash: string;
  createdAt: Date;
}
