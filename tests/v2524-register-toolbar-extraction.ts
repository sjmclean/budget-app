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
assert.match(toolbarComponent, /placeholder="Search transactions…"/);
assert.match(toolbarComponent, /aria-label="Search transactions"/);
assert.match(toolbarComponent, /key: "payees"/);
assert.match(toolbarComponent, /key: "categories"/);
assert.match(toolbarComponent, /key: "memos"/);
assert.match(toolbarComponent, /RegisterSearchDropdown/);
assert.match(
  toolbarComponent,
  /Scheduled.*scheduledDueCount/s,
);

console.log("v2.52.4 register toolbar extraction checks passed");
