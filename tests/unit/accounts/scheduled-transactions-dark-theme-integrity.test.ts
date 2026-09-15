import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const scheduledStyles = readFileSync(
  "apps/web/src/styles/scheduledTransactions.css",
  "utf8",
);

test("scheduled transaction styles no longer load through register header fixes", () => {
  assert.equal(existsSync("apps/web/src/styles/registerHeaderFixes.css"), false);
});

test("scheduled transaction cards use theme-neutral semantic tokens", () => {
  assert.match(scheduledStyles, /\.scheduled-item\s*\{[\s\S]*?background:\s*var\(--surface\)/);
  assert.match(scheduledStyles, /\.scheduled-item-main span\s*\{[\s\S]*?color:\s*var\(--text-muted\)/);
  assert.match(scheduledStyles, /\.scheduled-item-amounts \.negative\s*\{[\s\S]*?var\(--negative\)/);
  assert.match(scheduledStyles, /\.scheduled-item-amounts \.positive\s*\{[\s\S]*?var\(--positive\)/);
});
