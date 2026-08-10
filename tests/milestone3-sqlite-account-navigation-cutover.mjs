import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sidebar = readFileSync(
  new URL("../apps/web/src/layouts/Sidebar.tsx", import.meta.url),
  "utf8",
);
const registerPage = readFileSync(
  new URL("../apps/web/src/pages/AccountRegisterPage.tsx", import.meta.url),
  "utf8",
);
const server = readFileSync(
  new URL("../apps/server/src/server.mjs", import.meta.url),
  "utf8",
);

assert.match(sidebar, /accountRegisterQueries\.getBudgetStatus\(activeBudgetId\)/);
assert.match(sidebar, /accountRegisterQueries!\.listAccountNavigation\(activeBudgetId\)/);
assert.match(sidebar, /entry\.hasUncategorizedTransactions/);
assert.match(sidebar, /setAccountClosed\(\{/);
assert.match(sidebar, /aria-expanded=\{budgetAccountsOpen\}/);
assert.match(sidebar, /aria-expanded=\{creditCardsOpen\}/);
assert.match(sidebar, /aria-expanded=\{trackingAccountsOpen\}/);
assert.match(registerPage, /accountQueries\.listAccounts\(activeBudgetId\)/);
assert.match(server, /budgetEngineStore\.listAccounts\(budgetId\)/);

console.log("Milestone 3 SQLite account-navigation cutover passed.");
