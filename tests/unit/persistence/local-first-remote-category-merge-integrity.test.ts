import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name: string): string {
  const start = worker.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);

  const nextFunction = worker.indexOf("\nfunction ", start + 1);
  return worker.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

test("local and remote category merges share complete reference redirection", () => {
  assert.match(
    worker,
    /function redirectMergedCategoryReferences\s*\(/,
    "category merge reference propagation must have one shared helper",
  );

  const helper = functionBody("redirectMergedCategoryReferences");

  for (const [pattern, message] of [
    [/UPDATE local_transactions/, "ordinary transaction categories"],
    [/UPDATE local_transaction_splits/, "split transaction categories"],
    [/UPDATE\s+local_payees/, "payee default categories"],
    [/UPDATE\s+local_payee_recognition_rules/, "recognition-rule defaults"],
    [/local_scheduled_transactions/, "scheduled transaction categories"],
    [/payload\.splitLines/, "scheduled split categories"],
    [/mergeBudgetCategoryProjectionFacts/, "budget projection facts"],
  ] as const) {
    assert.match(
      helper,
      pattern,
      `${message} must be redirected by the shared merge helper`,
    );
  }

  assert.match(
    helper,
    /FROM local_scheduled_transactions\s+WHERE budget_id = \?/,
    "shared merge logic must inspect schedules even when only a split line references the source category",
  );

  const localMerge = functionBody("mergeCategories");
  assert.match(
    localMerge,
    /redirectMergedCategoryReferences\s*\(/,
    "local category merge must use the shared reference helper",
  );

  const remoteMerge = worker.match(
    /mutation\.domain === "categories" && mutation\.operation === "delete"[\s\S]*?markAllBudgetProjectionsDirty\(\);/,
  )?.[0];

  assert.ok(remoteMerge, "remote category-delete replay block must exist");

  assert.match(
    remoteMerge,
    /redirectMergedCategoryReferences\s*\(/,
    "remote category merge replay must use the same complete reference helper",
  );

  const redirectIndex = remoteMerge.indexOf(
    "redirectMergedCategoryReferences",
  );
  const deleteIndex = remoteMerge.indexOf(
    "DELETE FROM local_categories",
  );

  assert.ok(
    redirectIndex >= 0 && deleteIndex > redirectIndex,
    "remote replay must redirect all references before deleting the source category",
  );
});
