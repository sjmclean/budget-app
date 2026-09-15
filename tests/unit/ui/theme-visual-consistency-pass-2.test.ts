import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync("apps/web/src/styles/globals.css", "utf8");
const register = readFileSync("apps/web/src/styles/register.css", "utf8");
const registerToolbar = readFileSync("apps/web/src/styles/registerToolbar.css", "utf8");
const floatingMenu = readFileSync("apps/web/src/features/floatingUi/floatingMenu.css", "utf8");

function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...source.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]+)\\}`, "g"))];
  return matches.at(-1)?.[1] ?? "";
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("active styles contain no obsolete background or muted-surface variables", () => {
  const activeStyles = [globals, register, registerToolbar, floatingMenu].join("\n");
  assert.doesNotMatch(activeStyles, /var\(--bg\)/);
  assert.doesNotMatch(activeStyles, /var\(--surface-muted\)/);
});

test("shared overlay treatment is defined for every concrete theme and used by modal backdrops", () => {
  for (const selector of [":root", ':root[data-theme="dark"]', ':root[data-theme="blueprint"]']) {
    assert.match(rule(globals, selector), /--overlay-backdrop\s*:/);
  }
  for (const selector of [".modal-backdrop", ".settings-modal-backdrop", ".budget-activity-modal-backdrop"]) {
    assert.match(rule(globals, selector), /background\s*:\s*var\(--overlay-backdrop\)/);
  }
  assert.match(rule(registerToolbar, ".register-customize-overlay"), /var\(--overlay-backdrop\)/);
});

test("register context menu has a themed hover surface and visible keyboard focus", () => {
  const hover = rule(
    globals,
    ".register-context-menu-item:hover,\n.register-context-menu-item:focus-visible",
  );
  const focus = rule(globals, ".register-context-menu-item:focus-visible");
  assert.match(hover, /background\s*:\s*var\(--surface-subtle\)/);
  assert.match(focus, /outline\s*:\s*[^;]*var\(--accent\)/);
  assert.doesNotMatch(focus, /outline\s*:\s*none/);
});

test("Budget Manager family uses semantic surfaces, text, borders, accents and shadows", () => {
  const manager = section(
    globals,
    "/* v2.62.8 Budget Manager mockup implementation */",
    "/* v2.63.3 budget vs actual report */",
  );
  assert.doesNotMatch(
    manager,
    /#(?:ffffff|fff\b|f8fbff|f8fafc|0f172a|475569|64748b|0b3b91|155eef|dbeafe)/i,
  );
  assert.doesNotMatch(manager, /rgba\((?:148, 163, 184|255, 255, 255|15, 23, 42),/);
  for (const token of ["surface", "surface-subtle", "text", "text-muted", "border", "accent", "accent-soft", "shadow-md"]) {
    assert.match(manager, new RegExp(`var\\(--${token}\\)`));
  }
});

test("base New Budget wizard rules use canonical theme tokens", () => {
  const wizard = section(
    globals,
    "/* v2.62.9.1 — New Budget wizard layout polish */",
    ".budget-workspace-group-system .budget-workspace-group-header",
  );
  assert.doesNotMatch(wizard, /var\(--(?:text-secondary|text-primary|accent-primary)\)/);
  assert.doesNotMatch(
    wizard,
    /rgba\((?:148, 163, 184|255, 255, 255|37, 99, 235|34, 197, 94|59, 130, 246|15, 23, 42),/,
  );
  assert.doesNotMatch(wizard, /rgb\(22, 101, 52\)|#b91c1c/i);
  for (const token of [
    "surface",
    "surface-subtle",
    "text",
    "text-muted",
    "border",
    "border-soft",
    "accent",
    "accent-strong",
    "accent-soft",
    "positive",
    "positive-bg",
  ]) {
    assert.match(wizard, new RegExp(`var\\(--${token}\\)`));
  }
});

test("payee duplicate reasons use positive semantics", () => {
  assert.match(rule(globals, ".payee-duplicate-reasons > div"), /color\s*:\s*var\(--positive\)/);
  assert.doesNotMatch(rule(globals, ".payee-duplicate-reasons > div"), /#[0-9a-f]{3,8}/i);
});

test("shared dropdown and floating panels use semantic shadows", () => {
  assert.match(rule(globals, ".dropdown-menu-panel"), /box-shadow\s*:\s*var\(--shadow-md\)/);
  assert.match(rule(floatingMenu, ".floating-menu-panel"), /box-shadow\s*:\s*var\(--shadow-md\)/);
});
