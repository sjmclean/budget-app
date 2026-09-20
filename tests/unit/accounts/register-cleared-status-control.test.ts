import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("cleared status control has a visible affordance, state semantics, and pending protection", () => {
  const row = read("../../../apps/web/src/features/accounts/components/TransactionRow.tsx");

  assert.match(row, /aria-pressed=\{isCleared\}/);
  assert.match(row, /Mark transaction cleared/);
  assert.match(row, /Mark transaction uncleared/);
  assert.match(row, /aria-busy=\{isToggling \|\| undefined\}/);
  assert.match(row, /disabled=\{isToggling\}/);
  assert.match(row, />\s*C\s*<\/button>/);
});

test("reconciled status is display-only rather than a misleading button", () => {
  const row = read("../../../apps/web/src/features/accounts/components/TransactionRow.tsx");
  const start = row.indexOf("if (transaction.reconciled)");
  const end = row.indexOf("const isCleared", start);
  const reconciled = row.slice(start, end);

  assert.match(reconciled, /<span/);
  assert.doesNotMatch(reconciled, /<button/);
  assert.match(reconciled, /aria-label="Transaction reconciled"/);
});

test("desktop cleared status target is at least two rem square with visible focus", () => {
  const css = read("../../../apps/web/src/styles/register.css");
  const start = css.indexOf(".register-status {");
  const end = css.indexOf(".transaction-tag-indicator", start);
  const statusCss = css.slice(start, end);

  assert.match(statusCss, /width:\s*2rem/);
  assert.match(statusCss, /height:\s*2rem/);
  assert.match(statusCss, /button\.register-status:focus-visible/);
  assert.match(statusCss, /register-status-empty/);
  assert.match(statusCss, /register-status-cleared/);
});

test("register command returns the cleared mutation promise to the status control", () => {
  const commands = read("../../../apps/web/src/features/accounts/useRegisterCommands.ts");

  assert.match(
    commands,
    /toggleClearedTransaction:\s*\(transactionId: string\) => Promise<void>/,
  );
  assert.match(
    commands,
    /\(transactionId: string\) => toggleCleared\(transactionId\)/,
  );
});
