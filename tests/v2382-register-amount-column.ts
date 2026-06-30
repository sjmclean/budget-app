import { readFileSync } from "node:fs";
import { join } from "node:path";

const registerPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);

const transactionRow = readFileSync(
  join(process.cwd(), "apps/web/src/features/accounts/components/TransactionRow.tsx"),
  "utf8",
);

const registerCss = readFileSync(
  join(process.cwd(), "apps/web/src/styles/register.css"),
  "utf8",
);

function expectContains(source: string, value: string): void {
  if (!source.includes(value)) {
    throw new Error(`Missing expected text: ${value}`);
  }
}

expectContains(registerPage, 'id: "amount"');
expectContains(registerPage, 'label: "Amount"');
expectContains(registerPage, 'id: "outflow"');
expectContains(registerPage, 'id: "inflow"');
expectContains(registerPage, 'columnId === "amount"');

expectContains(transactionRow, 'getSignedTransactionAmount');
expectContains(transactionRow, 'formatSignedMoney');
expectContains(transactionRow, 'register-inflow');
expectContains(transactionRow, 'register-outflow');

expectContains(registerCss, '.register-outflow');
expectContains(registerCss, 'color: var(--negative)');
expectContains(registerCss, '.register-inflow');
expectContains(registerCss, 'color: var(--positive)');

console.log("v2.38.2 register amount column checks passed");
