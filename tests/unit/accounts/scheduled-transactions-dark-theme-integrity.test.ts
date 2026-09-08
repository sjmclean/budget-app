import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registerHeaderFixes = readFileSync(
  "apps/web/src/styles/registerHeaderFixes.css",
  "utf8",
);
const scheduledTheme = readFileSync(
  "apps/web/src/styles/scheduledTransactionsTheme.css",
  "utf8",
);

test("scheduled transaction theme styles are loaded by the register workspace", () => {
  assert.match(registerHeaderFixes, /@import\s+"\.\/scheduledTransactionsTheme\.css"/);
});

test("dark scheduled transaction cards use theme surfaces and readable text tokens", () => {
  assert.match(scheduledTheme, /data-theme="dark"[\s\S]*\.scheduled-item[\s\S]*background:[\s\S]*var\(--surface-subtle\)/);
  assert.match(scheduledTheme, /scheduled-item-main > strong[\s\S]*color:\s*var\(--text\)/);
  assert.match(scheduledTheme, /scheduled-item-main > span[\s\S]*color:\s*var\(--text-muted\)/);
  assert.match(scheduledTheme, /\.scheduled-item \.negative[\s\S]*var\(--negative\)/);
  assert.match(scheduledTheme, /\.scheduled-item \.positive[\s\S]*var\(--positive\)/);
});
