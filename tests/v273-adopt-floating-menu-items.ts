import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registerContextMenu = readFileSync(
  "apps/web/src/features/accounts/components/RegisterContextMenu.tsx",
  "utf8",
);
const moveTransactionsMenu = readFileSync(
  "apps/web/src/features/accounts/components/MoveTransactionsMenu.tsx",
  "utf8",
);

assert.match(
  registerContextMenu,
  /FloatingMenuItem/,
  "Register context menu should adopt FloatingMenuItem.",
);
assert.doesNotMatch(
  registerContextMenu,
  /<button/,
  "Register context menu should not render raw menu buttons directly.",
);
assert.match(
  registerContextMenu,
  /variant=\{resolveFloatingMenuItemVariant\(action\.variant\)\}/,
  "Register context menu should map action variants through the shared menu item API.",
);
assert.match(
  registerContextMenu,
  /pressed=\{action\.pressed\}/,
  "Register context menu should pass pressed state to FloatingMenuItem.",
);
assert.match(
  registerContextMenu,
  /icon=\{action\.icon\}/,
  "Register context menu should pass action icons to FloatingMenuItem.",
);
assert.match(
  moveTransactionsMenu,
  /FloatingMenuItem/,
  "Move transactions menu should adopt FloatingMenuItem.",
);
assert.doesNotMatch(
  moveTransactionsMenu,
  /<button/,
  "Move transactions menu should not render raw menu buttons directly.",
);
assert.match(
  moveTransactionsMenu,
  /className="register-move-account-item"/,
  "Move transactions menu should preserve a scoped account item class while using FloatingMenuItem.",
);
assert.match(
  moveTransactionsMenu,
  /onClose\(\);\s*onMoveTransactions\(account\.id\);/,
  "Move transactions menu should still close before moving transactions.",
);

console.log("v2.73 floating menu item adoption checks passed");
