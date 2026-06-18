export interface EncryptedRecord {
  id: string;
  budgetId: string;
  entityType: string;
  entityId: string;
  keyVersion: number;
  nonce: string;
  authTag: string;
  cipherText: string;
  createdAt: Date;
  updatedAt: Date;
}
