import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  readBudgetCreditCardBehaviour,
  readCreditCardPaymentFundingEnabled,
  isPaymentFundingEnabled,
  shouldCreatePaymentCategories,
} from "../apps/web/src/features/budget/creditCardBehaviourService";
import { createBudgetRegistryEntry } from "../apps/web/src/features/budget/budgetRegistry";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";

class MemoryStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  keys(): string[] {
    return [...this.values.keys()];
  }
}

function testCreditCardBehaviourRouting() {
  assert.equal(
    isPaymentFundingEnabled({ creditCardBehaviour: "normal" }),
    false,
    "Normal credit-card behaviour should not route activity through the payment-funding engine",
  );
  assert.equal(
    isPaymentFundingEnabled({ creditCardBehaviour: "payment-funding" }),
    true,
    "Payment-funding behaviour should route activity through the credit-card payment engine",
  );
  assert.equal(
    shouldCreatePaymentCategories({ creditCardBehaviour: "normal" }),
    false,
    "Normal behaviour should not create credit-card payment categories",
  );
  assert.equal(
    shouldCreatePaymentCategories({ creditCardBehaviour: "payment-funding" }),
    true,
    "Payment-funding behaviour should create credit-card payment categories",
  );
}

function testBudgetBehaviourRead() {
  const storage = new MemoryStorage();
  const budget = createBudgetRegistryEntry(storage, {
    name: "Card Budget",
    preferences: { creditCardBehaviour: "payment-funding" },
    now: new Date("2026-07-03T00:00:00.000Z"),
  });

  assert.equal(
    readBudgetCreditCardBehaviour(storage, budget.id),
    "payment-funding",
    "Budget credit-card behaviour should be read from the budget registry",
  );
  assert.equal(
    readBudgetCreditCardBehaviour(storage, "missing-budget"),
    "normal",
    "Missing budgets should safely fall back to normal credit-card behaviour",
  );
  assert.equal(
    readCreditCardPaymentFundingEnabled(storage, budget.id),
    true,
    "Payment-funding budgets should expose an intent-based routing helper",
  );
  assert.equal(
    readCreditCardPaymentFundingEnabled(storage, "missing-budget"),
    false,
    "Missing budgets should not enable credit-card payment funding",
  );
}

function testReleaseWiring() {
  const budgetViewService = readFileSync("apps/web/src/features/budget/budgetViewService.ts", "utf8");
  const sidebar = readFileSync("apps/web/src/layouts/Sidebar.tsx", "utf8");
  const packageJson = readFileSync("package.json", "utf8");

  assert.match(
    budgetViewService,
    /readCreditCardPaymentFundingEnabled/,
    "Budget activity should route through the shared credit-card budgeting service",
  );
  assert.match(
    budgetViewService,
    /shouldCreatePaymentCategories/,
    "Payment category creation should route through the shared credit-card budgeting service",
  );
  assert.match(
    sidebar,
    /shouldAskCreditCardBehaviour=\{shouldAskCreditCardBehaviour\}/,
    "First credit-card prompting should be owned by the Sidebar workflow",
  );
  assert.match(packageJson, /test:v2503:credit-card-behaviour-service/, "Release scripts should include v2.50.3 checks");
}

function run() {
  testCreditCardBehaviourRouting();
  testBudgetBehaviourRead();
  testReleaseWiring();
  console.log("v2.50.3 credit card behaviour service checks passed");
}

run();
