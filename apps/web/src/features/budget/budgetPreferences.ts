export const CREDIT_CARD_BEHAVIOUR_OPTIONS = ["normal", "payment-funding"] as const;

export type CreditCardBehaviour = (typeof CREDIT_CARD_BEHAVIOUR_OPTIONS)[number];

export interface BudgetPreferences {
  creditCardBehaviour: CreditCardBehaviour;
}

export const DEFAULT_CREDIT_CARD_BEHAVIOUR: CreditCardBehaviour = "normal";

export const DEFAULT_BUDGET_PREFERENCES: BudgetPreferences = {
  creditCardBehaviour: DEFAULT_CREDIT_CARD_BEHAVIOUR,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCreditCardBehaviour(value: unknown): value is CreditCardBehaviour {
  return typeof value === "string"
    && CREDIT_CARD_BEHAVIOUR_OPTIONS.includes(value as CreditCardBehaviour);
}

export function normaliseCreditCardBehaviour(value: unknown): CreditCardBehaviour {
  return isCreditCardBehaviour(value) ? value : DEFAULT_CREDIT_CARD_BEHAVIOUR;
}

export function normaliseBudgetPreferences(value: unknown): BudgetPreferences {
  if (!isRecord(value)) {
    return { ...DEFAULT_BUDGET_PREFERENCES };
  }

  return {
    creditCardBehaviour: normaliseCreditCardBehaviour(value.creditCardBehaviour),
  };
}

export function mergeBudgetPreferences(
  current: BudgetPreferences | undefined,
  next: Partial<BudgetPreferences> | undefined,
): BudgetPreferences {
  const base = normaliseBudgetPreferences(current);

  if (!next) {
    return base;
  }

  return {
    creditCardBehaviour: next.creditCardBehaviour === undefined
      ? base.creditCardBehaviour
      : normaliseCreditCardBehaviour(next.creditCardBehaviour),
  };
}
