import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const transactionRow = readFileSync("apps/web/src/features/accounts/components/TransactionRow.tsx", "utf8");
const registerPage = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/register.css", "utf8");
const pkg = readFileSync("package.json", "utf8");

assert(pkg.includes('"test:v221"'), "package.json should include test:v221");
assert(
  pkg.includes('"test:v221:split-balance-readonly"'),
  "package.json should include test:v221:split-balance-readonly",
);

assert(
  transactionRow.includes("register-split-toggle"),
  "register rows should expose a split expand/collapse toggle",
);
assert(
  transactionRow.includes("aria-expanded={isSplitExpanded}"),
  "split toggle should expose expanded state for accessibility",
);
assert(
  transactionRow.includes("register-split-readonly-row"),
  "expanded splits should render read-only child rows",
);
assert(
  transactionRow.includes("setIsSplitExpanded"),
  "split rows should maintain local expand/collapse state",
);

assert(
  registerPage.includes("SPLIT_BALANCE_TOLERANCE"),
  "split editor should compare totals with a money tolerance",
);
assert(
  registerPage.includes("getSplitBalanceStatus"),
  "split editor should calculate parent/split/remaining status",
);
assert(
  registerPage.includes("balanceLastSplit"),
  "split editor should provide a balance-last-split helper",
);
assert(
  registerPage.includes("!isSplitBalanced(") && registerPage.includes("parsedSplitLines.length > 0"),
  "split editor should block saving when split totals do not match the parent amount",
);
assert(
  registerPage.includes('className="register-split-footer"'),
  "split editor should render the balance summary and Save/Cancel in the split footer",
);
assert(
  registerPage.includes("disabled={") &&
    registerPage.includes("!isSplitBalanced(") &&
    registerPage.includes("buildSplitLines(splitLines, categoryOptions)"),
  "split Save button should be disabled while the split is unbalanced",
);

assert(css.includes(".register-split-toggle"), "split toggle CSS should exist");
assert(css.includes(".register-split-readonly-row"), "read-only split row CSS should exist");
assert(css.includes(".register-split-footer"), "split footer CSS should exist");
assert(css.includes(".register-split-balance-summary"), "split balance summary CSS should exist");
assert(css.includes(".register-split-commit-actions"), "split Save/Cancel action CSS should exist");

console.log("v2.21 split balance and read-only expansion checks passed");
