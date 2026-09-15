import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toolbar = readFileSync(
  "apps/web/src/features/accounts/components/RegisterToolbar.tsx",
  "utf8",
);

test("register desktop header keeps only frequent actions directly visible", () => {
  const desktopActions = toolbar.match(
    /<div className="register-toolbar-right register-desktop-actions">([\s\S]*?)<\/div>\n\n            <div className="register-mobile-actions">/,
  )?.[1];

  assert.ok(desktopActions);
  assert.match(desktopActions, />Undo<\/span>/);
  assert.match(desktopActions, />Redo<\/span>/);
  assert.match(desktopActions, /label="More ▾"/);
  assert.match(desktopActions, />Add transaction<\/button>/);
  assert.doesNotMatch(desktopActions, />Import<\/button>/);
  assert.doesNotMatch(desktopActions, />Manage tags<\/span>/);
});

test("infrequent register actions live in More menus on desktop and mobile", () => {
  assert.equal(toolbar.match(/>Import transactions<\/button>/g)?.length, 2);
  assert.equal(toolbar.match(/>Manage tags<\/button>/g)?.length, 2);
  assert.equal(toolbar.match(/ariaLabel="More register actions"/g)?.length, 2);
});

test("paused reconciliation is not exposed as a permanently disabled action", () => {
  assert.doesNotMatch(toolbar, /Reconcile/);
});
