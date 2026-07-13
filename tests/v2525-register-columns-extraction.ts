import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REGISTER_COLUMN_DEFINITIONS,
  REGISTER_COLUMN_LABELS,
  REGISTER_EDIT_COLUMN_DEFINITIONS,
  REGISTER_TABLE_LAYOUT_STORAGE_KEY_PREFIX,
  buildRegisterEditVisibleColumnIds,
  isRegisterColumnVisible,
  isRegisterEntryInputColumn,
} from "../apps/web/src/features/accounts/registerColumns";

const registerPageSource = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);
const registerColumnsSource = readFileSync(
  join(process.cwd(), "apps/web/src/features/accounts/registerColumns.ts"),
  "utf8",
);

assert.equal(
  REGISTER_TABLE_LAYOUT_STORAGE_KEY_PREFIX,
  "budget-app.register-columns.v1",
);

assert.deepEqual(
  REGISTER_COLUMN_DEFINITIONS.map((column) => column.id),
  [
    "select",
    "date",
    "tags",
    "attachments",
    "payee",
    "category",
    "memo",
    "checkNumber",
    "amount",
    "runningBalance",
    "status",
  ],
);

assert.deepEqual(
  REGISTER_EDIT_COLUMN_DEFINITIONS.map((column) => column.id),
  ["select", "date", "tags", "attachments", "payee", "category", "memo", "checkNumber", "outflow", "inflow"],
);

assert.deepEqual(
  buildRegisterEditVisibleColumnIds(["select", "date", "amount", "runningBalance", "status"]),
  ["select", "date", "outflow", "inflow"],
);

assert.equal(REGISTER_COLUMN_LABELS.get("checkNumber"), "Check #");
