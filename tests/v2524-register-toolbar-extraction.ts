import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const registerPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);
const toolbarComponent = readFileSync(
  join(
    process.cwd(),
    "apps/web/src/features/accounts/components/RegisterToolbar.tsx",
  ),
  "utf8",
);

assert.match(registerPage, /import \{ RegisterToolbar \}/);
assert.match(registerPage, /<RegisterToolbar/);
assert.doesNotMatch(registerPage, /function RegisterSearchDropdown/);
assert.doesNotMatch(registerPage, /<ColumnVisibilityMenu/);
assert.doesNotMatch(registerPage, /<DropdownMenu/);

assert.match(toolbarComponent, /export function RegisterToolbar/);
assert.match(toolbarComponent, /function RegisterSearchDropdown/);
assert.match(toolbarComponent, /<ColumnVisibilityMenu/);
assert.match(toolbarComponent, /<DropdownMenu/);
assert.match(toolbarComponent, /Search payees, categories, memos or amounts/);
assert.match(toolbarComponent, /Scheduled Transactions/);

console.log("v2.52.4 register toolbar extraction checks passed");
