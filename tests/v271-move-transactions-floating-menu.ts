import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  "apps/web/src/features/accounts/components/MoveTransactionsMenu.tsx",
  "utf8",
);
const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");

assert.match(
  component,
  /export function MoveTransactionsMenu/,
  "Move transactions menu should be extracted as a reusable component.",
);
assert.match(
  component,
  /<FloatingMenu/,
  "Move transactions menu should use the shared FloatingMenu component.",
);
assert.match(
  component,
  /FloatingMenuHeading/,
  "Move transactions menu should use the shared floating menu heading.",
);
assert.match(
  component,
  /FloatingMenuList/,
  "Move transactions menu should use the shared floating menu list.",
);
assert.match(
  component,
  /FloatingMenuItem/,
  "Move transactions menu should use the shared floating menu item primitive.",
);
assert.match(
  component,
  /register-move-popover-layer floating-menu-layer/,
  "Move transactions menu should keep move popover classes while adopting shared layer styling.",
);
assert.match(
  component,
  /register-move-popover floating-menu-panel/,
  "Move transactions menu should keep move popover classes while adopting shared panel styling.",
);
assert.match(
  component,
  /transferTransactionCount > 0/,
  "Move transactions menu should preserve transfer exclusion warnings.",
);
assert.match(
  component,
  /reconciledTransactionCount > 0/,
  "Move transactions menu should preserve reconciled exclusion warnings.",
);
assert.match(
  component,
  /getMoveAccountIcon/,
  "Move transactions menu should preserve account type icons.",
);
assert.match(
  component,
  /accounts\.map/,
  "Move transactions menu should render account targets.",
);
assert.match(
  component,
  /onClose\(\);\s*onMoveTransactions\(account\.id\);/,
  "Move transactions menu should close before moving transactions.",
);
assert.match(
  page,
  /register-move-popover-layer/,
  "Existing move transactions page wiring should remain available until the page migration commit.",
);

console.log("v2.71 move transactions floating menu checks passed");
