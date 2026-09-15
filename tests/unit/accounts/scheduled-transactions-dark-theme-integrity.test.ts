import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registerHeaderFixes = readFileSync(
  "apps/web/src/styles/registerHeaderFixes.css",
  "utf8",
);
const scheduledStyles = readFileSync(
  "apps/web/src/styles/scheduledTransactions.css",
  "utf8",
);

test("scheduled transaction styles no longer load through register header fixes", () => {
  assert.doesNotMatch(registerHeaderFixes, /scheduledTransactionsTheme/);
});

test("scheduled transaction cards use theme-neutral semantic tokens", () => {
  assert.match(scheduledStyles, /\.scheduled-item\s*\{[\s\S]*?background:\s*var\(--surface\)/);
  assert.match(scheduledStyles, /\.scheduled-item-main span\s*\{[\s\S]*?color:\s*var\(--text-muted\)/);
  assert.match(scheduledStyles, /\.scheduled-item-amounts \.negative\s*\{[\s\S]*?var\(--negative\)/);
  assert.match(scheduledStyles, /\.scheduled-item-amounts \.positive\s*\{[\s\S]*?var\(--positive\)/);
});
