import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const row = readFileSync(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
  "utf8",
);
const columns = readFileSync(
  "apps/web/src/features/accounts/registerColumns.ts",
  "utf8",
);
const tableLayout = readFileSync(
  "apps/web/src/features/tableLayout/tableLayout.ts",
  "utf8",
);

assert.match(page, /import \{ Paperclip, Tag \} from "lucide-react"/);
assert.match(page, /className="register-compact-head-tags register-head-icon"/);
assert.match(page, /aria-label="Tags"/);
assert.match(page, /title="Tags"/);
assert.match(page, /column\.id === "tags" \? \(/);
assert.doesNotMatch(page, /register-compact-head-tags">Tags/);
assert.doesNotMatch(row, /\| "flag"/);
assert.match(columns, /flag: "tags"/);
assert.match(page, /columnIdAliases: REGISTER_COLUMN_ID_ALIASES/);
assert.match(tableLayout, /columnIdAliases\[column\] \?\? column/);
assert.match(tableLayout, /columnIdAliases\[storedColumnId\] \?\? storedColumnId/);

console.log("v2.93.3 tag heading and layout migration checks passed");
