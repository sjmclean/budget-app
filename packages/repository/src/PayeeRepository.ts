import { Payee } from "../../types/src/Payee.js";

export interface PayeeRepository {
  create(payee: Payee): Promise<void>;
  update(payee: Payee): Promise<void>;
  archive(payeeId: string): Promise<void>;
  delete(payeeId: string): Promise<void>;
  findById(payeeId: string): Promise<Payee | null>;
  findByBudget(budgetId: string): Promise<Payee[]>;
  findActiveByBudget(budgetId: string): Promise<Payee[]>;
  findByNormalizedName(budgetId: string, normalizedName: string): Promise<Payee | null>;
  search(budgetId: string, query: string): Promise<Payee[]>;
}
