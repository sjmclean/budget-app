import { previewYnab4Import } from "../packages/ynab4-importer/src/index.js";

const accountsCsv = `Account,Type,Balance,On Budget
Checking,Checking,"$1,200.00",Yes
Visa,Credit Card,"($250.00)",Yes`;

const registerCsv = `Account,Date,Payee,Category,Memo,Outflow,Inflow,Cleared,Flag
Checking,2026-06-01,Woolworths,Everyday: Groceries,Weekly shop,$45.50,,C,Blue
Checking,2026-06-02,Employer,Income: Available this month,Payday,,"$2,000.00",R,
Checking,2026-06-03,Transfer : Visa,,Card payment,$250.00,,C,
Visa,2026-06-04,Split Transaction,Split,Two categories,$100.00,,,
`;

const budgetCsv = `Month,Category,Budgeted,Outflows,Balance
2026-06,Everyday: Groceries,$600.00,$45.50,$554.50
2026-06,Income: Available this month,$0.00,$0.00,$0.00`;

const preview = previewYnab4Import({ accountsCsv, registerCsv, budgetCsv });

if (preview.summary.accounts !== 2)
  throw new Error(`Expected 2 accounts, got ${preview.summary.accounts}`);
if (preview.summary.transactions !== 4)
  throw new Error(
    `Expected 4 transactions, got ${preview.summary.transactions}`,
  );
if (preview.summary.transfers !== 1)
  throw new Error(`Expected 1 transfer, got ${preview.summary.transfers}`);
if (preview.summary.splitTransactions !== 1)
  throw new Error(
    `Expected 1 split transaction, got ${preview.summary.splitTransactions}`,
  );
if (preview.summary.payees !== 3)
  throw new Error(
    `Expected 3 non-transfer payees, got ${preview.summary.payees}`,
  );
if (
  !preview.categories.some(
    (category) =>
      category.groupName === "Everyday" && category.name === "Groceries",
  )
) {
  throw new Error("Expected Everyday: Groceries category to be detected");
}
if (preview.summary.issues.some((issue) => issue.severity === "error")) {
  throw new Error("Did not expect fatal import issues in fixture");
}

console.log(
  "PASS: v1.2 YNAB4 preview parses accounts, transactions, payees, categories, transfers and splits",
);
