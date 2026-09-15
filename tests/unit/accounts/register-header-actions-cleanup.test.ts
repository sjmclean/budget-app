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
const headerFixes = readFileSync(
  "apps/web/src/styles/registerHeaderFixes.css",
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

test("register options menu keeps infrequent actions concise", () => {
  assert.match(toolbar, />Import transactions<\/button>/);
  assert.match(toolbar, />Manage tags<\/button>/);
  assert.match(toolbar, /<button type="button" role="menuitem" disabled>Reconcile<\/button>/);
  assert.match(toolbar, />Customize register…<\/button>/);
  assert.doesNotMatch(toolbar, /role="menuitemcheckbox"/);
  assert.doesNotMatch(toolbar, /register-column-option/);
  assert.equal(toolbar.match(/ariaLabel="Register options"/g)?.length, 2);
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

test("register customization panel has responsive themed presentation", () => {
  assert.match(headerFixes, /\.register-customize-overlay/);
  assert.match(headerFixes, /\.register-customize-dialog/);
  assert.match(headerFixes, /background: var\(--surface\)/);
  assert.match(headerFixes, /accent-color: var\(--accent\)/);
  assert.match(headerFixes, /@media \(max-width: 42rem\)[\s\S]*\.register-customize-dialog/);
});

test("icon-only dropdown triggers can expose an accessible name", () => {
  assert.match(dropdownMenu, /triggerAriaLabel\?: string/);
  assert.match(dropdownMenu, /aria-label=\{triggerAriaLabel\}/);
});
