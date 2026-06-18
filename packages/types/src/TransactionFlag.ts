export enum TransactionFlagColour {
  Red = "Red",
  Orange = "Orange",
  Yellow = "Yellow",
  Green = "Green",
  Blue = "Blue",
  Purple = "Purple",
}

export interface TransactionFlag {
  id: string;
  transactionId: string;
  colour: TransactionFlagColour;
  label: string | null;
  createdAt: Date;
}
