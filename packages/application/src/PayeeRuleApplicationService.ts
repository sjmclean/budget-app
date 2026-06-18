import type {
  AutoCategorizationSuggestion,
  ImportedBankTransaction,
  PayeeRule,
} from "../../types/src/index.js";

/**
 * Applies user-defined payee rules to imported transactions.
 *
 * Rules are separated from the parser so later UI can let users create rules like
 * "When bank text contains WOOLWORTHS, use payee Woolworths and category Groceries".
 * This is a foundation service; persistence can be added later without changing
 * the matching semantics tested here.
 */
export class PayeeRuleApplicationService {
  applyRules(
    importedRows: ImportedBankTransaction[],
    rules: PayeeRule[],
  ): AutoCategorizationSuggestion[] {
    const orderedRules = rules
      .filter((rule) => rule.isEnabled)
      .sort((a, b) => b.priority - a.priority);

    return importedRows.map((imported) => {
      const text = `${imported.rawPayee} ${imported.memo ?? ""}`;
      const rule = orderedRules.find((candidate) =>
        matchesRule(text, candidate),
      );

      if (!rule) {
        return {
          imported,
          ruleId: null,
          suggestedPayeeName: cleanPayee(imported.rawPayee) || null,
          suggestedCategoryId: null,
          suggestedMemo: imported.memo,
          confidence: 30,
          reason: "No rule matched; using cleaned bank payee only.",
        };
      }

      return {
        imported,
        ruleId: rule.id,
        suggestedPayeeName: rule.payeeName,
        suggestedCategoryId: rule.categoryId,
        suggestedMemo: rule.memo ?? imported.memo,
        confidence: rule.matchMode === "regex" ? 90 : 80,
        reason: `Matched payee rule '${rule.name}'.`,
      };
    });
  }
}

function matchesRule(text: string, rule: PayeeRule): boolean {
  if (rule.matchMode === "contains") {
    return text.toLowerCase().includes(rule.pattern.toLowerCase());
  }
  try {
    return new RegExp(rule.pattern, "i").test(text);
  } catch {
    // Invalid user regexes should not crash imports. They simply do not match.
    return false;
  }
}

function cleanPayee(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
