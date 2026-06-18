export interface AccountSettings {
  id: string;
  accountId: string;
  displayOrder: number;
  hidden: boolean;
  closed: boolean;
  startingBalanceDate: string | null;
  reconciliationReminder: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
