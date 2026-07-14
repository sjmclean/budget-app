import type { TransactionTagIcon } from "./transactionTagIconTypes";

export type TransactionTagColour =
  | "red"
  | "rose"
  | "gray"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "navy"
  | "indigo"
  | "violet"
  | "purple"
  | "fuchsia"
  | "pink"
  | "brown"
  | "sand"
  | "slate"
  | "black";

export interface TransactionTagDefinition {
  id: string;
  name: string;
  description?: string;
  colour: TransactionTagColour;
  icon?: TransactionTagIcon;
  autoTagImportedTransactions: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
