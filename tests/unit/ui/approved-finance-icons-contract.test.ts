import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const payeeIcon = readFileSync("apps/web/src/features/icons/PayeeIcon.tsx", "utf8");
const transferIcon = readFileSync("apps/web/src/features/icons/TransferIcon.tsx", "utf8");
const incomeIcon = readFileSync("apps/web/src/features/icons/IncomeIcon.tsx", "utf8");
const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");

test("PayeeIcon renders the approved custom transfer icon with existing accessibility semantics", () => {
  assert.match(payeeIcon, /resolved\.kind === "transfer"[^\n]+<TransferIcon size="100%"/u);
  assert.match(payeeIcon, /state === "transfer" \? "Transfer"/u);
  assert.match(payeeIcon, /decorative \? \{ "aria-hidden": true/u);
  assert.doesNotMatch(payeeIcon, /ArrowRightLeft/u);
  assert.match(transferIcon, /data-app-icon="transfer"/u);
  assert.match(transferIcon, /transfer-icon-outbound/u);
  assert.match(transferIcon, /transfer-icon-inbound/u);
});

test("IncomeIcon is reusable in explicit monthly-income UI and selectable payee icons", () => {
  assert.match(incomeIcon, /data-app-icon="income"/u);
  assert.match(incomeIcon, /<circle/u);
  assert.match(incomeIcon, /income-icon-arrow/u);
  assert.match(budgetPage, /<IncomeIcon size=\{16\} \/> Income for \{monthName\}/u);
  assert.match(payeeIcon, /IncomeIcon/u);
  assert.match(payeeIcon, /resolved\.kind === "income"/u);
});

