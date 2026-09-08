import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync("apps/web/src/main.tsx", "utf8");
const polish = readFileSync("apps/web/src/styles/darkThemePolish.css", "utf8");

test("global dark-theme polish is loaded after base theme tokens", () => {
  assert.match(main, /styles\/globals\.css[\s\S]*styles\/darkThemePolish\.css/);
});

test("negative account balances receive stronger dark-theme emphasis", () => {
  assert.match(polish, /register-main-balance\.register-main-balance-negative[\s\S]*var\(--negative-bg\)/);
  assert.match(polish, /register-main-balance\.register-main-balance-negative strong[\s\S]*var\(--negative\)/);
});

test("budget dark mode uses neutral surfaces with semantic status accents", () => {
  assert.match(polish, /budget-workspace-group-header[\s\S]*var\(--surface-subtle\)/);
  assert.match(polish, /available-pill-positive[\s\S]*var\(--positive-bg\)/);
  assert.match(polish, /available-pill-negative[\s\S]*var\(--negative-bg\)/);
  assert.match(polish, /available-pill-zero[\s\S]*var\(--surface-subtle\)/);
});
