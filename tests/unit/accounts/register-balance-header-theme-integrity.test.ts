import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toolbar = readFileSync(
  "apps/web/src/features/accounts/components/RegisterToolbar.tsx",
  "utf8",
);
const toolbarStyles = readFileSync(
  "apps/web/src/styles/registerToolbar.css",
  "utf8",
);

test("register balance header loads its owner stylesheet", () => {
  assert.match(toolbar, /registerToolbar\.css/);
});

test("register balance values use theme tokens for positive, negative, and neutral states", () => {
  assert.match(toolbarStyles, /register-main-balance-positive[\s\S]*var\(--positive\)/);
  assert.match(toolbarStyles, /register-main-balance-negative[\s\S]*var\(--negative\)/);
  assert.match(toolbarStyles, /register-main-balance-neutral[\s\S]*var\(--text\)/);
});

test("register header reserves the fixed sync indicator footprint responsively", () => {
  assert.match(
    toolbarStyles,
    /register-sticky-stack \.register-clean-header[\s\S]*padding-inline-end:[\s\S]*10rem/,
  );
  assert.match(toolbarStyles, /@media \(max-width: 42rem\)/);
  assert.match(toolbarStyles, /padding-inline-end:[\s\S]*3\.75rem/);
});
