import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sidebar = await readFile(
  new URL("../apps/web/src/layouts/Sidebar.tsx", import.meta.url),
  "utf8",
);
const selector = await readFile(
  new URL("../apps/web/src/pages/BudgetSelectorPage.tsx", import.meta.url),
  "utf8",
);
const register = await readFile(
  new URL("../apps/web/src/features/accounts/useAccountRegister.ts", import.meta.url),
  "utf8",
);

const navigationEffect = sidebar.slice(
  sidebar.indexOf("async function loadAccountNavigation"),
  sidebar.indexOf("const activeAccounts"),
);
assert.doesNotMatch(
  navigationEffect,
  /location\.pathname/,
  "Changing account routes must not reload the complete sidebar navigation.",
);
assert.match(sidebar, /prefetchAccountRegister/);
assert.match(selector, /listAccountNavigation\(budget\.id\)/);
assert.doesNotMatch(
  selector.slice(
    selector.indexOf("void Promise.all(sortedBudgets"),
    selector.indexOf("setHostedStats"),
  ),
  /getAccountSummary/,
  "Budget statistics must not make one summary request per account.",
);
assert.match(register, /getAccountRegisterBootstrap/);

console.log("Milestone 3 account navigation performance contracts passed.");
