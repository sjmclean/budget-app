import { AutoCategorizationApplicationService } from "../packages/application/src/AutoCategorizationApplicationService.js";
import { PayeeRuleApplicationService } from "../packages/application/src/PayeeRuleApplicationService.js";
import { TransactionMatchingApplicationService } from "../packages/application/src/TransactionMatchingApplicationService.js";
import type {
  ExistingTransactionForMatch,
  ImportedBankTransaction,
  PayeeRule,
} from "../packages/types/src/index.js";

const imported: ImportedBankTransaction[] = [
  {
    externalId: "bank-1",
    date: "2026-06-05",
    rawPayee: "WOOLWORTHS 1234 MELBOURNE",
    memo: "CARD PURCHASE",
    amount: -6350,
    importedCategoryName: null,
  },
  {
    externalId: "bank-2",
    date: "2026-06-06",
    rawPayee: "ACME PAYROLL",
    memo: "SALARY",
    amount: 250000,
    importedCategoryName: null,
  },
];

const existing: ExistingTransactionForMatch[] = [
  {
    id: "tx-1",
    date: "2026-06-05",
    amount: -6350,
    payeeName: "Woolworths",
    memo: "manual entry",
    externalId: null,
  },
  {
    id: "tx-2",
    date: "2026-06-05",
    amount: -1200,
    payeeName: "Coffee Shop",
    memo: null,
    externalId: null,
  },
];

const matcher = new TransactionMatchingApplicationService();
const matches = matcher.suggestMatches(imported, existing);
if (matches.length !== 1)
  throw new Error("Expected one duplicate/match suggestion");
if (matches[0].existingTransactionId !== "tx-1")
  throw new Error(
    "Expected imported Woolworths row to match existing transaction tx-1",
  );
if (matches[0].score < 70) throw new Error("Expected confident match score");

const rules: PayeeRule[] = [
  {
    id: "rule-groceries",
    budgetId: "budget-1",
    name: "Woolworths groceries",
    pattern: "WOOLWORTHS",
    matchMode: "contains",
    payeeName: "Woolworths",
    categoryId: "cat-groceries",
    memo: null,
    priority: 100,
    isEnabled: true,
  },
  {
    id: "rule-income",
    budgetId: "budget-1",
    name: "Salary income",
    pattern: "PAYROLL|SALARY",
    matchMode: "regex",
    payeeName: "ACME Payroll",
    categoryId: null,
    memo: "Income",
    priority: 90,
    isEnabled: true,
  },
];

const payeeRules = new PayeeRuleApplicationService();
const suggestions = payeeRules.applyRules(imported, rules);
if (suggestions[0].suggestedPayeeName !== "Woolworths")
  throw new Error("Expected Woolworths payee rule to apply");
if (suggestions[0].suggestedCategoryId !== "cat-groceries")
  throw new Error("Expected groceries category suggestion");
if (suggestions[1].suggestedPayeeName !== "ACME Payroll")
  throw new Error("Expected regex payroll rule to apply");

const auto = new AutoCategorizationApplicationService();
const autoSuggestions = auto.suggest(imported, rules);
if (autoSuggestions.length !== 2)
  throw new Error(
    "Expected auto-categorisation suggestions for both imported rows",
  );

console.log("v1.2.13 matching and payee rules OK");
