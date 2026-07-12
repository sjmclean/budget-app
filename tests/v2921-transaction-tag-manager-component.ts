import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  transactionTagColourOptions,
} from "../apps/web/src/features/tags/TransactionTagManager";

assert.deepEqual(
  transactionTagColourOptions.map((option) => option.value),
  ["red", "orange", "yellow", "green", "blue", "purple"],
);

const source = readFileSync(
  "apps/web/src/features/tags/TransactionTagManager.tsx",
  "utf8",
);

assert.match(source, /Auto-tag imported transactions/);
assert.match(source, /service\.createTag/);
assert.match(source, /service\.updateTag/);
assert.match(source, /service\.archiveTag/);
assert.match(source, /service\.restoreTag/);
assert.match(source, /service\.deleteTag/);
assert.match(source, /<svg[\s\S]*transaction-tag-icon/);
assert.match(
  source,
  /disabled=\{usage\.transactionCount > 0\}/,
  "used tags must not expose an enabled delete action",
);

console.log("v2.92.1 transaction tag manager component checks passed");
