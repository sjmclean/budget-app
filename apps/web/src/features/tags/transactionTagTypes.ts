export type TransactionTagColour =
  | "red"
  | "gray"
  | "orange"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "blue"
  | "indigo"
  | "purple"
  | "pink"
  | "brown"
  | "slate"
  | "black";

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
