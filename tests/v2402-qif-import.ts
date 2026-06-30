import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseTransactionQif,
  previewTransactionQifImport,
} from "../apps/web/src/features/accounts/transactionImport";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";

const qif = `!Type:Bank
D01/06'26
PWoolworths
MGroceries
T-42.50
^
D02/06/2026
PSalary
T1250.00
^
`;

const parsed = parseTransactionQif(qif);

assert.equal(parsed.length, 2);
assert.equal(parsed[0].date, "2026-06-01");
assert.equal(parsed[0].payee, "Woolworths");
assert.equal(parsed[0].memo, "Groceries");
assert.equal(parsed[0].outflow, 42.5);
assert.equal(parsed[0].inflow, 0);
assert.equal(parsed[1].date, "2026-06-02");
assert.equal(parsed[1].payee, "Salary");
assert.equal(parsed[1].outflow, 0);
assert.equal(parsed[1].inflow, 1250);

const existing: RegisterTransactionView[] = [
  {
    id: "existing-1",
    date: "2026-06-01",
    payee: "Woolworths",
    category: "Groceries",
    memo: "Groceries",
    outflow: 42.5,
    inflow: 0,
    cleared: false,
    reconciled: false,
    runningBalance: 0,
    checkNumber: "",
    flag: null,
    attachmentCount: 0,
  },
];

const preview = previewTransactionQifImport(qif, existing);

assert.equal(preview.summary.totalRows, 2);
assert.equal(preview.summary.exactMatches, 1);
assert.equal(preview.summary.newTransactions, 1);
assert.equal(preview.summary.selectedForImport, 1);
assert.equal(preview.candidates[0].status, "exact-match");
assert.equal(preview.candidates[0].selected, false);
assert.equal(preview.candidates[1].status, "new");
assert.equal(preview.candidates[1].selected, true);

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(dialog, /previewTransactionQifImport/);
assert.match(dialog, /detectedType === "qif"/);
assert.match(dialog, /QIF detected/);
assert.match(dialog, /CSV and QIF import are available/);
assert.equal(packageJson.scripts["test:v2402"], "pnpm test:v2401 && pnpm test:v2402:qif-import");

console.log("v2.40.2 QIF import checks passed");
