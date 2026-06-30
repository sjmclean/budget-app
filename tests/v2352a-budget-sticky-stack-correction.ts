import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("apps/web/src/styles/globals.css", "utf8");

assert.match(css, /\.budget-sticky-working-header\s*\{[\s\S]*position:\s*sticky;/);
assert.match(css, /\.budget-sticky-working-header\s*\{[\s\S]*isolation:\s*isolate;/);
assert.match(css, /\.budget-sticky-working-header::before\s*\{[\s\S]*background:\s*var\(--background\);/);
assert.match(css, /\.budget-sticky-working-header\s*>\s*\*\s*\{[\s\S]*z-index:\s*1;/);
assert.match(css, /\.budget-workspace-table-card\s*\{[\s\S]*z-index:\s*0;/);

console.log("v2.35.2a Budget sticky stack correction checks passed.");
