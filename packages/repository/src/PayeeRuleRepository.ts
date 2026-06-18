import type { PayeeRule } from "../../types/src/index.js";

export interface PayeeRuleRepository {
  create(rule: PayeeRule): Promise<void>;
  update(rule: PayeeRule): Promise<void>;
  delete(ruleId: string): Promise<void>;
  getById(ruleId: string): Promise<PayeeRule | null>;
  findByBudget(budgetId: string): Promise<PayeeRule[]>;
  findEnabledByBudget(budgetId: string): Promise<PayeeRule[]>;
}
