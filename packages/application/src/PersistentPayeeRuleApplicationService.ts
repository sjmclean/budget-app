import type { PayeeRule, PayeeRuleConflict } from "../../types/src/index.js";
import type { PayeeRuleRepository } from "../../repository/src/PayeeRuleRepository.js";

/**
 * CRUD and validation wrapper for persisted payee rules.
 *
 * The pure PayeeRuleApplicationService still owns matching semantics. This service owns
 * lifecycle concerns: saving rules, keeping rule priorities deterministic, and warning
 * about ambiguous rules before they surprise the user during a bank import.
 */
export class PersistentPayeeRuleApplicationService {
  constructor(private readonly rules: PayeeRuleRepository) {}

  async create(rule: PayeeRule): Promise<void> {
    validateRule(rule);
    await this.rules.create(rule);
  }

  async update(rule: PayeeRule): Promise<void> {
    validateRule(rule);
    await this.rules.update(rule);
  }

  async delete(ruleId: string): Promise<void> {
    await this.rules.delete(ruleId);
  }

  async list(budgetId: string): Promise<PayeeRule[]> {
    return await this.rules.findByBudget(budgetId);
  }

  async listEnabled(budgetId: string): Promise<PayeeRule[]> {
    return await this.rules.findEnabledByBudget(budgetId);
  }

  /**
   * Finds rules that are likely to produce surprising import results.
   *
   * Conflicts are warnings, not hard failures: users may intentionally create
   * overlapping rules, but the import review UI should surface them before a
   * bank statement is committed.
   */
  async detectConflicts(budgetId: string): Promise<PayeeRuleConflict[]> {
    const rules = await this.rules.findByBudget(budgetId);
    const conflicts: PayeeRuleConflict[] = [];

    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const first = rules[i];
        const second = rules[j];
        if (!first.isEnabled || !second.isEnabled) continue;
        if (first.priority !== second.priority) continue;
        if (normal(first.pattern) === normal(second.pattern) && first.matchMode === second.matchMode) {
          conflicts.push({
            ruleId: first.id,
            conflictingRuleId: second.id,
            reason: "Enabled rules use the same pattern and priority; import results would depend on secondary ordering."
          });
        }
      }
    }

    return conflicts;
  }
}

function validateRule(rule: PayeeRule): void {
  if (!rule.budgetId) throw new Error("Payee rule requires a budgetId");
  if (!rule.name.trim()) throw new Error("Payee rule requires a name");
  if (!rule.pattern.trim()) throw new Error("Payee rule requires a pattern");
  if (!rule.payeeName.trim()) throw new Error("Payee rule requires a target payee name");
  if (rule.matchMode === "regex") {
    try { new RegExp(rule.pattern); } catch { throw new Error("Payee rule regex pattern is invalid"); }
  }
}

function normal(value: string): string {
  return value.trim().toLowerCase();
}
