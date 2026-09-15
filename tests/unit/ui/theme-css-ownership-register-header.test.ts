import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const toolbarComponent = readFileSync(
  "apps/web/src/features/accounts/components/RegisterToolbar.tsx",
  "utf8",
);
const undoToastComponent = readFileSync(
  "apps/web/src/features/accounts/components/RegisterUndoToast.tsx",
  "utf8",
);
const toolbar = readFileSync("apps/web/src/styles/registerToolbar.css", "utf8");
const undoToast = readFileSync("apps/web/src/styles/registerUndoToast.css", "utf8");
const register = readFileSync("apps/web/src/styles/register.css", "utf8");
const darkPolish = readFileSync("apps/web/src/styles/darkThemePolish.css", "utf8");

function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

test("Register toolbar and undo toast directly import their owner stylesheets", () => {
  assert.match(toolbarComponent, /import\s+"\.\.\/\.\.\/\.\.\/styles\/registerToolbar\.css"/);
  assert.match(undoToastComponent, /import\s+"\.\.\/\.\.\/\.\.\/styles\/registerUndoToast\.css"/);
  assert.equal(existsSync("apps/web/src/styles/registerHeaderFixes.css"), false);

  const sourceFiles = readdirSync("apps/web/src", { recursive: true })
    .filter((path) => typeof path === "string" && /\.(?:css|tsx?)$/.test(path))
    .map((path) => readFileSync(`apps/web/src/${path}`, "utf8"))
    .join("\n");
  assert.doesNotMatch(sourceFiles, /registerHeaderFixes\.css/);
});

test("representative Register header surfaces have one feature owner", () => {
  for (const selector of [
    ".register-main-balance",
    ".register-view-tabs",
    ".register-search-shell",
    ".register-search-dropdown",
    ".register-more-menu-panel",
    ".register-customize-overlay",
  ]) {
    assert.match(toolbar, new RegExp(`\\${selector}\\b`));
    assert.doesNotMatch(register, new RegExp(`\\${selector}\\b`));
  }
});

test("RegisterUndoToast exclusively owns its presentation", () => {
  assert.match(undoToast, /\.register-undo-toast\s*\{/);
  assert.match(undoToast, /\.register-undo-toast-action/);
  assert.match(undoToast, /\.register-undo-toast-dismiss/);
  assert.doesNotMatch(register, /\.register-undo-toast/);
  assert.doesNotMatch(toolbar, /\.register-undo-toast/);
});

test("Register header owners use semantic theme and financial tokens", () => {
  const positive = rule(toolbar, ".register-main-balance-positive");
  const negative = rule(toolbar, ".register-main-balance-negative");
  assert.match(positive, /var\(--positive\)/);
  assert.match(positive, /var\(--positive-bg\)/);
  assert.match(negative, /var\(--negative\)/);
  assert.match(negative, /var\(--negative-bg\)/);
  assert.match(rule(toolbar, ".register-customize-overlay"), /var\(--overlay-backdrop\)/);

  const owners = `${toolbar}\n${undoToast}`;
  assert.doesNotMatch(
    owners,
    /#(?:15803d|dcfce7|b91c1c|fee2e2|2563eb|fff(?:fff)?|64748b|0f172a)\b/i,
  );
  assert.doesNotMatch(owners, /rgba\(15,\s*23,\s*42,/);
  assert.doesNotMatch(
    owners,
    /var\(--(?:surface|surface-subtle|text|text-muted|border|border-soft|accent|accent-strong|accent-soft),/,
  );
});

test("Register header needs no dark repair selectors", () => {
  assert.doesNotMatch(darkPolish, /:root\[data-theme=["']dark["']\][^{]*\.register-main-balance/);
});

test("Register-integrated Scheduled preview remains Register-owned", () => {
  assert.match(register, /\.register-scheduled-ghosts\s*\{/);
  assert.match(register, /\.register-scheduled-ghost-row\s*\{/);
  assert.doesNotMatch(toolbar, /\.register-scheduled-ghost/);
  assert.doesNotMatch(undoToast, /\.register-scheduled-ghost/);
});
