import { Budget } from "../../types/src/Budget.js";

export interface BudgetRepository {
  create(budget: Budget): Promise<void>;
  getById(id: string): Promise<Budget | null>;
}
