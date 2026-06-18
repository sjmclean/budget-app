export interface Payee {
  id: string;
  budgetId: string;
  name: string;
  normalizedName?: string;
  isArchived?: boolean;
  isTransfer?: boolean;
  transferAccountId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
