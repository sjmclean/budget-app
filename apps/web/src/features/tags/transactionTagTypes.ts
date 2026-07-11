export type TransactionTagColour =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

export interface TransactionTagDefinition {
  id: string;
  name: string;
  description?: string;
  colour: TransactionTagColour;
  autoTagImportedTransactions: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}