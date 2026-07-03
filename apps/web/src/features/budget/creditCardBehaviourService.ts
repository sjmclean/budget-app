import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import {
  DEFAULT_CREDIT_CARD_BEHAVIOUR,
  type CreditCardBehaviour,
} from "./budgetPreferences";
import { readBudgetRegistry } from "./budgetRegistry";

interface CreditCardBehaviourInput {
  creditCardBehaviour: CreditCardBehaviour;
}

/**
 * Returns the configured budgeting behaviour for a budget.
 *
 * Older budgets that pre-date Budget Preferences automatically fall back to
 * the default behaviour to preserve backwards compatibility.
 */
export function readBudgetCreditCardBehaviour(
  storage: KeyValueStoragePort,
  budgetId: string,
): CreditCardBehaviour {
  const budget = readBudgetRegistry(storage).find(
    (entry) => entry.id === budgetId,
  );

  return (
    budget?.preferences?.creditCardBehaviour ??
    DEFAULT_CREDIT_CARD_BEHAVIOUR
  );
}

/**
 * True when this budget uses the credit card payment funding model.
 */
export function isPaymentFundingEnabled({
  creditCardBehaviour,
}: CreditCardBehaviourInput): boolean {
  return creditCardBehaviour === "payment-funding";
}

/**
 * Convenience API for callers that only need to know whether payment funding
 * is active for a budget. This keeps consumers from coupling to the stored
 * preference value.
 */
export function readCreditCardPaymentFundingEnabled(
  storage: KeyValueStoragePort,
  budgetId: string,
): boolean {
  return isPaymentFundingEnabled({
    creditCardBehaviour: readBudgetCreditCardBehaviour(storage, budgetId),
  });
}

/**
 * Payment categories are only required when payment funding is enabled.
 */
export function shouldCreatePaymentCategories(
  input: CreditCardBehaviourInput,
): boolean {
  return isPaymentFundingEnabled(input);
}