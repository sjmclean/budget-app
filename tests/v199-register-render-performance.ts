import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registerPageSource = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
const useRegisterSource = readFileSync(
  "apps/web/src/features/accounts/useAccountRegister.ts",
  "utf8",
);

assert.match(
  registerPageSource,
  /const TransactionRow = memo\(function TransactionRow/,
  "Register transaction rows should be memoized so selection/edit state changes do not rerender every visible row.",
);

assert.match(
  registerPageSource,
  /const handleSelectTransaction = useCallback/,
  "Register row selection handler should be stable across renders.",
);
assert.match(
  registerPageSource,
  /const handleEditTransaction = useCallback/,
  "Register row edit handler should be stable across renders.",
);
assert.match(
  registerPageSource,
  /const handleToggleClearedTransaction = useCallback/,
  "Register row cleared-toggle handler should be stable across renders.",
);
assert.match(
  registerPageSource,
  /const handleManageTransactionAttachments = useCallback/,
  "Register row attachment handler should be stable across renders.",
);

assert.doesNotMatch(
  registerPageSource,
  /\}, \[data\?\.transactions, payeesPersistence\]\);/,
  "Payee option loading must not rerun after every register transaction mutation.",
);

assert.match(
  useRegisterSource,
  /const transactionById = useMemo/,
  "Selected transaction lookup should use a memoized transaction index instead of scanning every transaction on selection changes.",
);
assert.match(
  useRegisterSource,
  /transactionById\.get\(selectedTransactionId\)/,
  "Selected transaction lookup should be O(1).",
);

console.log("v1.99 register render performance checks passed");
