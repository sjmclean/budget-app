import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync("apps/web/src/main.tsx", "utf8");
const budgetWorkspace = readFileSync("apps/web/src/styles/budgetWorkspace.css", "utf8");
const registerToolbar = readFileSync("apps/web/src/styles/registerToolbar.css", "utf8");

test("Budget semantic styles no longer require a global dark repair layer", () => {
  assert.equal(existsSync("apps/web/src/styles/darkThemePolish.css"), false);
  assert.doesNotMatch(main, /darkThemePolish/);
  assert.doesNotMatch(budgetWorkspace, /\[data-theme=["']dark["']\]/);
});

test("negative account balances use semantic emphasis in every theme", () => {
  assert.match(registerToolbar, /register-main-balance-negative[\s\S]*var\(--negative-bg\)/);
  assert.match(registerToolbar, /register-main-balance-negative[\s\S]*var\(--negative\)/);
  assert.doesNotMatch(registerToolbar, /\[data-theme=["']dark["']\]/);
});

test("Budget workspace uses neutral surfaces with semantic status accents in every theme", () => {
  assert.match(budgetWorkspace, /budget-workspace-group-header[\s\S]*var\(--surface-subtle\)/);
  assert.match(budgetWorkspace, /available-pill-positive[\s\S]*var\(--positive-bg\)/);
  assert.match(budgetWorkspace, /available-pill-negative[\s\S]*var\(--negative-bg\)/);
  assert.match(budgetWorkspace, /available-pill-zero[\s\S]*var\(--surface-subtle\)/);
});
