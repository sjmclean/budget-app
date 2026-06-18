import { Account } from "../../types/src/Account.js";

export interface AccountRepository {
  create(account: Account): Promise<void>;
  update(account: Account): Promise<void>;
  getById(id: string): Promise<Account | null>;
  findByBudget(budgetId: string): Promise<Account[]>;
}
