import { AccountType } from "./AccountType.js";
import { BudgetParticipation } from "./BudgetParticipation.js";

export interface Account {
  id: string;
  budgetId: string;
  name: string;
  type: AccountType;
  participation: BudgetParticipation;
  openingBalance: number;
  currentBalance: number;
}
