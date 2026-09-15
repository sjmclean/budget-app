import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toolbar = readFileSync(
  "apps/web/src/features/accounts/components/RegisterToolbar.tsx",
  "utf8",
);
const dropdownMenu = readFileSync(
  "apps/web/src/features/ui/DropdownMenu.tsx",
  "utf8",
);

test("register desktop header keeps only frequent actions directly visible", () => {
  const desktopActions = toolbar.match(
    /<div className="register-toolbar-right register-desktop-actions">([\s\S]*?)<\/div>\n\n            <div className="register-mobile-actions">/,
  )?.[1];

  assert.ok(desktopActions);
  assert.match(desktopActions, />Undo<\/span>/);
  assert.match(desktopActions, />Redo<\/span>/);
  assert.match(desktopActions, /label="⋯"/);
  assert.match(desktopActions, /triggerAriaLabel="Register options"/);
  assert.match(desktopActions, />Add transaction<\/button>/);
  assert.doesNotMatch(desktopActions, /Columns ▾/);
  assert.doesNotMatch(desktopActions, /More ▾/);
});

test("infrequent register actions and layout controls live in one options menu", () => {
  assert.match(toolbar, />Import transactions<\/button>/);
  assert.match(toolbar, />Manage tags<\/button>/);
  assert.match(toolbar, /<button type="button" role="menuitem" disabled>Reconcile<\/button>/);
  assert.match(toolbar, /role="menuitemcheckbox"/);
  assert.match(toolbar, />Reset layout<\/button>/);
  assert.doesNotMatch(toolbar, /ColumnVisibilityMenu/);
  assert.equal(toolbar.match(/ariaLabel="Register options"/g)?.length, 2);
});

test("reconciliation remains visible as a disabled future option", () => {
  assert.match(toolbar, /disabled>Reconcile<\/button>/);
});

test("icon-only dropdown triggers can expose an accessible name", () => {
  assert.match(dropdownMenu, /triggerAriaLabel\?: string/);
  assert.match(dropdownMenu, /aria-label=\{triggerAriaLabel\}/);
});
