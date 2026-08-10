import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const group = read("apps/web/src/features/budget/BudgetWorkspaceGroup.tsx");
const workspace = read("apps/web/src/features/budget/useBudgetWorkspace.ts");
const shell = read("apps/web/src/layouts/AppShell.tsx");
const row = read("apps/web/src/features/accounts/components/TransactionRow.tsx");
const toolbar = read("apps/web/src/features/accounts/components/RegisterToolbar.tsx");
const globals = read("apps/web/src/styles/globals.css");
const register = read("apps/web/src/styles/register.css");

assert.match(group, /category\.assigned === 0 \? ""/);
assert.match(group, /onFocus=\{\(event\) => event\.currentTarget\.select\(\)\}/);
assert.match(workspace, /previewCategoryAssignment\(currentData, categoryId, assigned\)/);
assert.match(workspace, /}, 75\);/);
assert.match(shell, /budget-app-navigation-rail-expanded/);
assert.doesNotMatch(shell, /navigationMode !== "rail"[\s\S]{0,120}setRailExpanded\(false\)/);
assert.match(row, /<Paperclip size=\{13\} aria-hidden="true" \/>/);
assert.match(row, /data-attachment-count=\{hasAttachments \? count : undefined\}/);
assert.match(toolbar, /register-manage-tags-action[\s\S]{0,180}<span>Manage tags<\/span>/);
assert.match(globals, /\.available-pill \{[\s\S]{0,100}width: 5\.75rem/);
assert.match(globals, /data-theme="blueprint"\] \.budget-workspace-group-header/);
assert.match(globals, /var\(--accent-soft\) 34%, var\(--surface\)/);
assert.match(register, /\.attachment-indicator\.attachment-indicator-present \{[\s\S]{0,420}opacity: 1/);
assert.match(register, /\.attachment-indicator\.attachment-indicator-present::after \{[\s\S]{0,260}attr\(data-attachment-count\)/);
assert.match(register, /\.attachment-indicator\.attachment-indicator-empty \{[\s\S]{0,300}opacity: 0\.14/);

console.log("Milestone 4 budget/register interaction structural contracts passed.");
