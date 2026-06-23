export type Ynab4CompletenessStatus = "ready" | "partial" | "missing" | "ux-gap";
export type Ynab4CompletenessRisk = "low" | "medium" | "high" | "critical";

export interface Ynab4CompletenessItem {
  id: string;
  area: string;
  ynab4Data: string;
  currentAppCapability: string;
  status: Ynab4CompletenessStatus;
  risk: Ynab4CompletenessRisk;
  importImpact: string;
  requiredBeforeFullImport: boolean;
  recommendedAction: string;
}

export interface Ynab4CompletenessSummary {
  total: number;
  ready: number;
  partial: number;
  missing: number;
  uxGaps: number;
  requiredBlockers: number;
  criticalBlockers: number;
}

export interface Ynab4ImportCompletenessAudit {
  title: string;
  scope: string;
  summary: Ynab4CompletenessSummary;
  items: Ynab4CompletenessItem[];
  requiredBeforeImport: Ynab4CompletenessItem[];
  recommendedBuildOrder: string[];
}

const ITEMS: Ynab4CompletenessItem[] = [
  {
    id: "accounts",
    area: "Accounts",
    ynab4Data: "Account names, account types, on-budget state, hidden state, last reconciled balance/date, check number metadata.",
    currentAppCapability: "Core accounts exist. AccountSettings supports hidden/closed/notes/startingBalanceDate, but YNAB4 reconciliation/check-number metadata is not yet mapped.",
    status: "partial",
    risk: "medium",
    importImpact: "Accounts can be created, but metadata may be lost unless account settings and reconciliation fields are mapped deliberately.",
    requiredBeforeFullImport: true,
    recommendedAction: "Define YNAB4 account mapping, including hidden accounts, off-budget accounts, starting balances, and last reconciled metadata."
  },
  {
    id: "category-groups",
    area: "Category Groups",
    ynab4Data: "Master categories/category headers, including name, sort order, hidden group behaviour, and category group/header notes.",
    currentAppCapability: "Category groups exist and CategoryGroupSettings now provides a notes target for YNAB4 category header notes. Import mapping is still required.",
    status: "partial",
    risk: "medium",
    importImpact: "YNAB4 category header notes are now representable, but will still be lost unless the importer maps them into CategoryGroupSettings.notes.",
    requiredBeforeFullImport: true,
    recommendedAction: "Map YNAB4 master-category/header notes to CategoryGroupSettings.notes and add import test coverage using real YNAB4 note examples."
  },
  {
    id: "categories",
    area: "Categories",
    ynab4Data: "Subcategories, sort order, hidden categories, cached balances, and individual category notes.",
    currentAppCapability: "Categories exist. CategorySettings has notes/hidden/pinned/colour, and the budget inspector can now edit individual category notes. YNAB4 import mapping is still required.",
    status: "partial",
    risk: "high",
    importImpact: "Individual category notes can likely be represented, but would be lost unless the importer maps them into CategorySettings.notes.",
    requiredBeforeFullImport: true,
    recommendedAction: "Map YNAB4 category note and hidden state to CategorySettings. Add import test coverage using the real YNAB4 note examples."
  },
  {
    id: "budget-month-history",
    area: "Historical Budget Months",
    ynab4Data: "monthlyBudgets and monthlySubCategoryBudgets with budgeted amounts and overspendingHandling.",
    currentAppCapability: "BudgetMonth and CategoryMonth tables exist, but full YNAB4 monthly allocation import has not been proven.",
    status: "partial",
    risk: "critical",
    importImpact: "Transactions alone are not a full YNAB4 migration. Losing historical budget allocations would make old budget months inaccurate.",
    requiredBeforeFullImport: true,
    recommendedAction: "Build a dedicated YNAB4 monthly budget mapping test before importing transactions."
  },
  {
    id: "transactions",
    area: "Transactions",
    ynab4Data: "Transactions with date, amount, account, payee, category, memo, cleared state, accepted state, flags, check numbers, import metadata, tombstones, and transfer links.",
    currentAppCapability: "Core transactions support date/amount/account/payee/category/memo/cleared/transfer. Flags exist as separate schema. Check numbers and accepted/import metadata are not represented in the core transaction model.",
    status: "partial",
    risk: "critical",
    importImpact: "Most transactions can be represented, but check numbers and some YNAB4 metadata may be lost. Tombstones must be ignored or used for conflict history, not imported as active transactions.",
    requiredBeforeFullImport: true,
    recommendedAction: "Add transaction check number support or decide an explicit preservation strategy. Define accepted/imported metadata handling."
  },
  {
    id: "transaction-check-numbers",
    area: "Transaction Check Numbers",
    ynab4Data: "YNAB4 transactions may include checkNumber.",
    currentAppCapability: "No transaction checkNumber field or transaction metadata field is present in the core Transaction type/schema.",
    status: "missing",
    risk: "high",
    importImpact: "Cheque/check-number data will be silently lost unless the schema is extended or the value is preserved in memo/metadata.",
    requiredBeforeFullImport: true,
    recommendedAction: "Add optional checkNumber to transactions, or create a general transaction metadata table and map YNAB4 checkNumber there."
  },
  {
    id: "splits",
    area: "Split Transactions",
    ynab4Data: "subTransactions on transactions with category, memo, amount, and transfer relationships.",
    currentAppCapability: "SplitTransactionLine exists for regular transactions.",
    status: "partial",
    risk: "high",
    importImpact: "Regular split transactions are representable, but YNAB4 split transfer edge cases need dedicated mapping tests.",
    requiredBeforeFullImport: true,
    recommendedAction: "Create real-data split import tests, including split transactions with memos and transfer-like lines."
  },
  {
    id: "scheduled-transactions",
    area: "Scheduled Transactions",
    ynab4Data: "Scheduled transactions with frequency, next date, memo, cleared state, transfers, and subTransactions.",
    currentAppCapability: "ScheduledTransaction exists, but scheduled split lines/subTransactions and YNAB4-specific frequencies such as twice-a-month details are not fully represented.",
    status: "partial",
    risk: "critical",
    importImpact: "Scheduled transactions can be partially imported, but split scheduled transactions and some recurrence details may be lost.",
    requiredBeforeFullImport: true,
    recommendedAction: "Add scheduled split line support and map YNAB4 recurrence metadata, including twiceAMonthStartDay."
  },
  {
    id: "payees",
    area: "Payees",
    ynab4Data: "Payees, transfer payees, enabled state, targetAccountId, autoFillCategoryId, autoFillAmount, autoFillMemo, renameConditions, and locations.",
    currentAppCapability: "Payees and transfer payees exist. PayeeRules exist, but YNAB4 payee auto-fill and rename conditions are not mapped.",
    status: "partial",
    risk: "medium",
    importImpact: "Payee names can import, but YNAB4 payee behaviour/rules may be lost unless mapped into rules or metadata.",
    requiredBeforeFullImport: false,
    recommendedAction: "Import basic payees first; then map auto-fill and rename conditions into PayeeRules where possible."
  },
  {
    id: "transfers",
    area: "Transfers",
    ynab4Data: "targetAccountId and transferTransactionId link paired transactions.",
    currentAppCapability: "Transfer transactions and transfer payees are supported, but importer must preserve pair relationships and avoid duplicate transfer creation.",
    status: "partial",
    risk: "critical",
    importImpact: "Incorrect transfer import will distort account balances and duplicate activity.",
    requiredBeforeFullImport: true,
    recommendedAction: "Build transfer-pair import tests using targetAccountId and transferTransactionId before committing transaction import."
  },
  {
    id: "transaction-flags",
    area: "Transaction Flags",
    ynab4Data: "Transactions may include flag values.",
    currentAppCapability: "TransactionFlag type and schema exist, but YNAB4 flag mapping and UI surfacing are not proven.",
    status: "partial",
    risk: "medium",
    importImpact: "Flag data could be represented but may still be dropped by the importer if not explicitly mapped.",
    requiredBeforeFullImport: false,
    recommendedAction: "Map YNAB4 flags into TransactionFlag and add preview/import tests."
  },
  {
    id: "reconciliation",
    area: "Reconciliation State",
    ynab4Data: "Transaction cleared state plus account lastReconciledDate and lastReconciledBalance.",
    currentAppCapability: "Transaction clearedStatus and Reconciliation table exist, but YNAB4 account-level reconciliation metadata is not yet mapped.",
    status: "partial",
    risk: "high",
    importImpact: "Balances and reconciliation workflow may be confusing after import if historical reconciliation state is not preserved or explained.",
    requiredBeforeFullImport: true,
    recommendedAction: "Map cleared/reconciled states and decide whether to create reconciliation records from YNAB4 account metadata."
  },
  {
    id: "credit-cards",
    area: "Credit Cards",
    ynab4Data: "Credit card accounts, pre-YNAB debt categories, transfers/payments, and historical category balances.",
    currentAppCapability: "Credit-card-style liability behaviour exists conceptually, but full YNAB4 credit card migration has not been validated against real data.",
    status: "partial",
    risk: "critical",
    importImpact: "Credit card balances, payments, and historical category availability may import incorrectly without specific mapping tests.",
    requiredBeforeFullImport: true,
    recommendedAction: "Create a dedicated YNAB4 credit card migration test before full transaction import."
  },
  {
    id: "ynab4-source-ids",
    area: "Import Traceability",
    ynab4Data: "Every YNAB4 entity has entityId/entityVersion; imported transactions may include YNABID/source/matchedTransactions/importedPayee.",
    currentAppCapability: "ImportRun and ImportMap tables exist, but YNAB4 package import has not yet used them.",
    status: "partial",
    risk: "medium",
    importImpact: "Without source-id mapping, imports are harder to debug, resume, validate, or de-duplicate.",
    requiredBeforeFullImport: true,
    recommendedAction: "Use ImportRun/ImportMap for every YNAB4 entity imported."
  }
];

export function getYnab4ImportCompletenessItems(): Ynab4CompletenessItem[] {
  return ITEMS.map((item) => ({ ...item }));
}

export function assessYnab4ImportCompleteness(): Ynab4ImportCompletenessAudit {
  const items = getYnab4ImportCompletenessItems();
  const summary: Ynab4CompletenessSummary = {
    total: items.length,
    ready: items.filter((item) => item.status === "ready").length,
    partial: items.filter((item) => item.status === "partial").length,
    missing: items.filter((item) => item.status === "missing").length,
    uxGaps: items.filter((item) => item.status === "ux-gap").length,
    requiredBlockers: items.filter((item) => item.requiredBeforeFullImport).length,
    criticalBlockers: items.filter((item) => item.risk === "critical" && item.requiredBeforeFullImport).length
  };

  return {
    title: "YNAB4 Import Completeness Audit",
    scope: "Determines which current app capabilities must exist before full-fidelity YNAB4 package import can safely write data.",
    summary,
    items,
    requiredBeforeImport: items.filter((item) => item.requiredBeforeFullImport),
    recommendedBuildOrder: [
      "Add category group/header notes support.",
      "Add transaction check-number preservation.",
      "Add scheduled split transaction support and YNAB4 recurrence mapping.",
      "Prove historical monthly budget/category-month mapping.",
      "Prove transfer-pair and credit-card migration against real YNAB4 data.",
      "Wire ImportRun/ImportMap source-id tracking for YNAB4 entities."
    ]
  };
}
