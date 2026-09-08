import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toolbar = readFileSync(
  "apps/web/src/features/accounts/components/RegisterToolbar.tsx",
  "utf8",
);
const fixes = readFileSync(
  "apps/web/src/styles/registerHeaderFixes.css",
  "utf8",
);

test("register balance header loads its focused theme/overlay fixes", () => {
  assert.match(toolbar, /registerHeaderFixes\.css/);
});

test("register balance values use theme tokens for positive, negative, and neutral states", () => {
  assert.match(fixes, /register-main-balance-positive strong[\s\S]*var\(--positive\)/);
  assert.match(fixes, /register-main-balance-negative strong[\s\S]*var\(--negative\)/);
  assert.match(fixes, /register-main-balance-neutral strong[\s\S]*var\(--text\)/);
});

test("register header reserves the fixed sync indicator footprint responsively", () => {
  assert.match(
    fixes,
    /register-sticky-stack \.register-clean-header[\s\S]*padding-inline-end:[\s\S]*10rem/,
  );
  assert.match(fixes, /@media \(max-width: 42rem\)/);
  assert.match(fixes, /padding-inline-end:[\s\S]*3\.75rem/);
});
