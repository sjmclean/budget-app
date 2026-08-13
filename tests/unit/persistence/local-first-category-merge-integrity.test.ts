import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workerSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

function categoryMergeBody(): string {
  const start = workerSource.indexOf("function mergeCategories(");
  const end = workerSource.indexOf("\nasync function openBudget", start);

  assert.notEqual(start, -1, "mergeCategories() must exist");
  assert.notEqual(end, -1, "mergeCategories() boundary must be found");

  return workerSource.slice(start, end);
}

test("category merge redirects all persisted category references before deleting the source", () => {
  const body = categoryMergeBody();

  assert.match(
    body,
    /UPDATE local_transactions SET category_id = \?, category_name = \?/,
    "ordinary transaction categories must be redirected",
  );

  assert.match(
    body,
    /UPDATE local_transaction_splits SET category_id = \?, category_name = \?/,
    "split transaction categories must be redirected",
  );

  assert.match(
    body,
    /UPDATE\s+local_payees\s+SET\s+default_category_id = \?, default_category_name = \?/,
    "payee default categories must be redirected",
  );

  assert.match(
    body,
    /UPDATE\s+local_payee_recognition_rules\s+SET\s+default_category_id = \?, default_category_name = \?/,
    "recognition-rule default categories must be redirected",
  );

  assert.match(
    body,
    /local_scheduled_transactions/,
    "scheduled transaction category references must be redirected",
  );

  assert.match(
    body,
    /payload\.splitLines/,
    "scheduled split category references must be inspected",
  );

  assert.match(
    body,
    /categoryId:\s*targetCategoryId/,
    "scheduled split category ids must be redirected",
  );

  assert.match(
    body,
    /categoryName:\s*targetCategoryName/,
    "scheduled split category names must be redirected",
  );

  const deleteIndex = body.indexOf(
    'DELETE FROM local_categories WHERE budget_id = ? AND id = ?',
  );

  assert.notEqual(deleteIndex, -1, "source category must be deleted");

  for (const requiredUpdate of [
    "UPDATE local_transactions",
    "UPDATE local_transaction_splits",
    "UPDATE local_payees",
    "UPDATE local_payee_recognition_rules",
    "local_scheduled_transactions",
  ]) {
    const updateIndex = body.indexOf(requiredUpdate);
    assert.ok(
      updateIndex >= 0 && updateIndex < deleteIndex,
      `${requiredUpdate} must occur before source category deletion`,
    );
  }

  assert.match(body, /BEGIN IMMEDIATE/);
  assert.match(body, /COMMIT/);
  assert.match(body, /ROLLBACK/);
});
