import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  "apps/web/src/components/accounts/ScheduledTransactionsPanel.tsx",
  "utf8",
);
const scheduled = readFileSync(
  "apps/web/src/styles/scheduledTransactions.css",
  "utf8",
);
const register = readFileSync("apps/web/src/styles/register.css", "utf8");
const registerHeaderFixes = readFileSync(
  "apps/web/src/styles/registerHeaderFixes.css",
  "utf8",
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return scheduled.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

test("ScheduledTransactionsPanel directly owns its stylesheet", () => {
  assert.match(component, /import\s+"\.\.\/\.\.\/styles\/scheduledTransactions\.css"/);
  assert.doesNotMatch(registerHeaderFixes, /scheduledTransactionsTheme/);
  assert.equal(existsSync("apps/web/src/styles/scheduledTransactionsTheme.css"), false);
});

test("full Scheduled panel, editor, card and split styles have one feature owner", () => {
  for (const selector of [
    ".scheduled-panel",
    ".scheduled-editor-dialog",
    ".scheduled-item",
    ".scheduled-split-details",
    ".scheduled-split-line",
  ]) {
    assert.match(scheduled, new RegExp(`\\${selector}\\b`));
    assert.doesNotMatch(register, new RegExp(`\\${selector}\\b`));
  }
});

test("formerly dark-repaired Scheduled rules are semantic at their base", () => {
  assert.match(rule(".scheduled-item"), /background:\s*var\(--surface\)/);
  assert.match(rule(".scheduled-item-main span"), /color:\s*var\(--text-muted\)/);
  assert.match(rule(".scheduled-item-amounts .negative"), /color:\s*var\(--negative\)/);
  assert.match(rule(".scheduled-item-amounts .positive"), /color:\s*var\(--positive\)/);
  assert.match(rule(".scheduled-split-toggle"), /color:\s*var\(--text\)/);
  assert.match(rule(".scheduled-split-details"), /background:\s*var\(--surface-subtle\)/);
  assert.match(rule(".scheduled-split-line-main span"), /color:\s*var\(--text\)/);
  assert.match(rule(".scheduled-split-line-main small"), /color:\s*var\(--text-muted\)/);
});

test("Scheduled owner has no dark repair selectors or fixed theme palette", () => {
  assert.doesNotMatch(scheduled, /:root\[data-theme=["']dark["']\]/);
  assert.doesNotMatch(
    scheduled,
    /#(?:fff(?:fff)?|f8fafc|f1f5f9|64748b|334155|0f172a|b91c1c|047857|dc2626|2563eb)\b/i,
  );
  assert.doesNotMatch(scheduled, /rgba\(15,\s*23,\s*42,/);
  assert.doesNotMatch(scheduled, /var\(--(?:surface|surface-subtle|border|border-soft|text|text-muted|accent),/);
});

test("Register-integrated Scheduled preview remains Register-owned", () => {
  assert.match(register, /\.register-scheduled-ghosts\s*\{/);
  assert.match(register, /\.register-scheduled-ghost-row\s*\{/);
  assert.match(register, /\.register-scheduled-ghost-menu-panel\s*\{/);
  assert.doesNotMatch(scheduled, /\.register-scheduled-ghost/);
});
