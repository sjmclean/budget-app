import { randomUUID } from "crypto";
import { Account } from "../../../types/src/Account.js";
import { AccountType } from "../../../types/src/AccountType.js";
import { BudgetParticipation } from "../../../types/src/BudgetParticipation.js";

export interface CreateAccountInput {
  budgetId: string;
  name: string;
  type: AccountType;
  participation: BudgetParticipation;
  openingBalance?: number;
}

/**
 * Creates an account domain object.
 *
 * Older tests and services call this helper with positional arguments:
 *   createAccount(budgetId, name, type, participation, openingBalance)
 *
 * Newer v1.2.x tests call it with a single object:
 *   createAccount({ budgetId, name, type, participation, openingBalance })
 *
 * Supporting both forms keeps the public helper backward-compatible and avoids
 * accidentally constructing accounts with undefined fields, which later causes
 * better-sqlite3 to report "Too few parameter values were provided" because
 * undefined bindings are treated as missing values.
 */
export function createAccount(input: CreateAccountInput): Account;
export function createAccount(
  budgetId: string,
  name: string,
  type: AccountType,
  participation: BudgetParticipation,
  openingBalance?: number
): Account;
export function createAccount(
  inputOrBudgetId: CreateAccountInput | string,
  name?: string,
  type?: AccountType,
  participation?: BudgetParticipation,
  openingBalance = 0
): Account {
  const input = typeof inputOrBudgetId === "object"
    ? inputOrBudgetId
    : { budgetId: inputOrBudgetId, name, type, participation, openingBalance };

  if (!input.budgetId || !input.name || !input.type || !input.participation) {
    throw new Error("createAccount requires budgetId, name, type and participation");
  }

  const startingBalance = input.openingBalance ?? 0;

  return {
    id: randomUUID(),
    budgetId: input.budgetId,
    name: input.name,
    type: input.type,
    participation: input.participation,
    openingBalance: startingBalance,
    currentBalance: startingBalance
  };
}
