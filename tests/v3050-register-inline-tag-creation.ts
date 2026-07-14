import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const row = readFileSync(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
  "utf8",
);
const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const styles = readFileSync("apps/web/src/styles/register.css", "utf8");

assert(
  row.includes('placeholder="Search or create tag…"'),
  "Register tag picker must provide BFB-style search and create input",
);
assert(
  row.includes('Create “{normalisedQuery}”') && row.includes("createAndSelectTag"),
  "Register tag picker must allow inline tag creation",
);
assert(
  row.includes("draftTagIds") && row.includes("saveTags"),
  "Tag changes must be staged until Save is selected",
);
assert(
  row.includes("onCreateTransactionTag") && row.includes("onCreateTag={onCreateTransactionTag}"),
  "All register row layouts must receive the inline tag creation callback",
);
assert(
  page.includes("transactionTagService.createTag") &&
    page.includes('colour: "blue"') &&
    page.includes("setTransactionTags(transactionTagService.listTags())"),
  "Register page must create and refresh reusable tags through the tag service",
);
assert(
  styles.includes(".transaction-tag-picker-search") &&
    styles.includes(".transaction-tag-picker-create") &&
    styles.includes(".transaction-tag-picker-save"),
  "Register tag picker must include search, create, and full-width Save styling",
);

console.log("v3.05 inline register tag creation checks passed.");
