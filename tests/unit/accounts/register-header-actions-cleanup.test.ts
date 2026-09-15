import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toolbar = readFileSync(
  "apps/web/src/features/accounts/components/RegisterToolbar.tsx",
  "utf8",
);
const undoToast = readFileSync(
  "apps/web/src/features/accounts/components/RegisterUndoToast.tsx",
  "utf8",
);
const applicationHistory = readFileSync(
  "apps/web/src/features/history/applicationHistory.ts",
  "utf8",
);
const dropdownMenu = readFileSync(
  "apps/web/src/features/ui/DropdownMenu.tsx",
  "utf8",
);
const headerFixes = readFileSync(
  "apps/web/src/styles/registerHeaderFixes.css",
  "utf8",
);

test("register desktop header keeps only primary actions directly visible", () => {
  const desktopActions = toolbar.match(
    /<div className="register-toolbar-right register-desktop-actions">([\s\S]*?)<\/div>\n\n            <div className="register-mobile-actions">/,
  )?.[1];

  assert.ok(desktopActions);
  assert.match(desktopActions, /label="⋯"/);
  assert.match(desktopActions, /triggerAriaLabel="Register options"/);
  assert.match(desktopActions, />Add transaction<\/button>/);
  assert.doesNotMatch(desktopActions, /register-history-action/);
  assert.doesNotMatch(desktopActions, />Undo<\/span>/);
  assert.doesNotMatch(desktopActions, />Redo<\/span>/);
  assert.doesNotMatch(desktopActions, /Columns ▾/);
  assert.doesNotMatch(desktopActions, /More ▾/);
});

test("register options keeps undo and redo persistently available", () => {
  assert.match(toolbar, /className="register-history-menu-item"[\s\S]*?<span>Undo<\/span>/);
  assert.match(toolbar, /className="register-history-menu-item"[\s\S]*?<span>Redo<\/span>/);
  assert.match(toolbar, /disabled=\{!canUndo \|\| isHistoryBusy\}/);
  assert.match(toolbar, /disabled=\{!canRedo \|\| isHistoryBusy\}/);
  assert.match(toolbar, />Ctrl\/Cmd\+Z<\/span>/);
  assert.match(toolbar, />Ctrl\/Cmd\+Shift\+Z<\/span>/);
  assert.equal(toolbar.match(/renderRegisterOptions\(closeMenu\)/g)?.length, 2);
});

test("register options menu keeps infrequent actions concise", () => {
  assert.match(toolbar, />Import transactions<\/button>/);
  assert.match(toolbar, />Manage tags<\/button>/);
  assert.match(toolbar, /<button type="button" role="menuitem" disabled>Reconcile<\/button>/);
  assert.match(toolbar, />\s*Customize register…\s*<\/button>/);
  assert.doesNotMatch(toolbar, /role="menuitemcheckbox"/);
  assert.doesNotMatch(toolbar, /register-column-option/);
  assert.equal(toolbar.match(/ariaLabel="Register options"/g)?.length, 2);
});

test("successful history executions can drive a contextual undo toast", () => {
  assert.match(applicationHistory, /subscribeToActions/);
  assert.match(applicationHistory, /this\.emitAction\(key, result\)/);
  assert.match(undoToast, /applicationHistory\.subscribeToActions/);
  assert.match(undoToast, /result\.action === "execute"/);
  assert.match(undoToast, /UNDO_TOAST_DURATION_MS = 6000/);
  assert.match(undoToast, />\s*Undo\s*<\/button>/);
  assert.match(undoToast, /setToast\(null\);\n          onUndo\(\);/);
  assert.match(toolbar, /<RegisterUndoToast/);
});

test("undo and redo actions dismiss the contextual toast without clearing history", () => {
  assert.match(undoToast, /if \(result\.action === "execute"\)[\s\S]*?setToast\(null\);/);
  assert.doesNotMatch(undoToast, /applicationHistory\.clear/);
});

test("reconciliation remains visible as a disabled future option", () => {
  assert.match(toolbar, /disabled>Reconcile<\/button>/);
});

test("register layout controls live in a dedicated customization dialog", () => {
  assert.match(toolbar, /function CustomizeRegisterPanel/);
  assert.match(toolbar, /role="dialog"/);
  assert.match(toolbar, /aria-modal="true"/);
  assert.match(toolbar, />Customize register<\/h2>/);
  assert.match(toolbar, />Columns<\/h3>/);
  assert.match(toolbar, /hideableColumns\.map/);
  assert.match(toolbar, /type="checkbox"/);
  assert.match(toolbar, />Reset layout<\/button>/);
  assert.match(toolbar, />Done<\/button>/);
  assert.match(toolbar, /event\.key === "Escape"/);
});

test("register customization and undo toast have responsive themed presentation", () => {
  assert.match(headerFixes, /\.register-customize-overlay/);
  assert.match(headerFixes, /\.register-customize-dialog/);
  assert.match(headerFixes, /background: var\(--surface\)/);
  assert.match(headerFixes, /accent-color: var\(--accent\)/);
  assert.match(headerFixes, /\.register-undo-toast/);
  assert.match(headerFixes, /\.register-search-shell[\s\S]*max-width: 22rem/);
  assert.match(headerFixes, /@media \(max-width: 42rem\)[\s\S]*\.register-search-shell[\s\S]*max-width: none/);
  assert.match(headerFixes, /@media \(max-width: 42rem\)[\s\S]*\.register-undo-toast/);
  assert.match(headerFixes, /@media \(max-width: 42rem\)[\s\S]*\.register-customize-dialog/);
});

test("icon-only dropdown triggers can expose an accessible name", () => {
  assert.match(dropdownMenu, /triggerAriaLabel\?: string/);
  assert.match(dropdownMenu, /aria-label=\{triggerAriaLabel\}/);
});
