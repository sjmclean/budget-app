import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const row = readFileSync("apps/web/src/features/accounts/components/TransactionRow.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/globals.css", "utf8");

assert.match(page, /registerContextMenuPosition/, "AccountRegisterPage should track right-click menu position.");
assert.match(page, /handleOpenRegisterContextMenu/, "AccountRegisterPage should expose a context menu open handler.");
assert.match(page, /registerSelection\.selectSingle\(transactionId\)/, "Right-clicking an unselected row should select it first.");
assert.match(page, /register-context-menu-layer/, "AccountRegisterPage should render the floating context menu layer.");
assert.match(page, /registerSelectionActions\.actions\.map/, "Context menu should reuse existing selection action definitions.");
assert.match(page, /window\.addEventListener\("scroll", closeRegisterContextMenu, true\)/, "Context menu should close on scroll.");
assert.match(page, /onOpenContextMenu=\{handleOpenRegisterContextMenu\}/, "TransactionRow should receive the context menu handler.");

assert.match(row, /onOpenContextMenu/, "TransactionRow should accept an onOpenContextMenu prop.");
assert.match(row, /onContextMenu=\{\(event\) => onOpenContextMenu\(transaction\.id, event\)\}/, "Transaction rows should open the menu from native contextmenu events.");

assert.match(css, /\.register-context-menu-layer/, "Context menu layer styling should exist.");
assert.match(css, /\.register-context-menu-item-danger/, "Danger action styling should exist.");

console.log("v2.66 register context menu checks passed");
