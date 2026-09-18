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

function functionBody(name: string): string {
  const start = workerSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name}() must exist`);

  const nextFunction = workerSource.indexOf("\nfunction ", start + 1);
  return workerSource.slice(
    start,
    nextFunction === -1 ? undefined : nextFunction,
  );
}

test("category merge redirects all persisted category references before deleting the source", () => {
  const helper = functionBody("redirectMergedCategoryReferences");
  const merge = functionBody("mergeCategories");

  assert.match(
    helper,
    /UPDATE local_transactions SET category_id = \?, category_name = \?/,
    "ordinary transaction categories must be redirected",
  );

  assert.match(
    helper,
    /UPDATE local_transaction_splits SET category_id = \?, category_name = \?/,
    "split transaction categories must be redirected",
  );

  assert.match(
    helper,
    /UPDATE\s+local_payees\s+SET\s+default_category_id = \?, default_category_name = \?/,
    "payee default categories must be redirected",
  );

  assert.match(
    helper,
    /UPDATE\s+local_payee_recognition_rules\s+SET\s+default_category_id = \?, default_category_name = \?/,
    "recognition-rule default categories must be redirected",
  );

  assert.match(
    helper,
    /FROM local_scheduled_transactions\s+WHERE budget_id = \?/,
    "all budget schedules must be inspected so split-only category references are redirected",
  );

  assert.match(
    helper,
    /payload\.splitLines/,
    "scheduled split category references must be inspected",
  );

  assert.match(
    helper,
    /categoryId:\s*targetCategoryId/,
    "scheduled split category ids must be redirected",
  );

  assert.match(
    helper,
    /categoryName:\s*resolvedTargetCategoryName/,
    "scheduled split category names must be redirected",
  );

  assert.match(
    helper,
    /mergeBudgetCategoryProjectionFacts/,
    "budget projection facts must be merged",
  );

  assert.match(
    merge,
    /redirectMergedCategoryReferences\s*\(/,
    "local merge must use the shared reference redirect",
  );

  const redirectIndex = merge.indexOf(
    "redirectMergedCategoryReferences",
  );
  const deleteIndex = merge.indexOf(
    "DELETE FROM local_categories",
  );

  assert.ok(
    redirectIndex >= 0 && deleteIndex > redirectIndex,
    "all references must be redirected before deleting the source category",
  );

  assert.match(merge, /BEGIN IMMEDIATE/);
  assert.match(merge, /COMMIT/);
  assert.match(merge, /ROLLBACK/);
  assert.match(
    merge,
    /budgetMonthMutation[\s\S]*writeNormalisedDomainEntity\(\s*"budgetMonths"/,
    "ordinary merge must apply the budget-month replacement inside the merge transaction",
  );
  assert.match(
    merge,
    /if \(budgetMonthMutation\) insertOutbox\(budgetMonthMutation\)/,
    "the budget-month mutation must be persisted in the same outbox transaction",
  );
  assert.match(
    merge,
    /budgetMonthMutation \? 2 : 1/,
    "local revision must count both ordinary merge mutations",
  );

  const budgetWriteIndex = merge.indexOf(
    `writeNormalisedDomainEntity(
        "budgetMonths"`,
  );
  const mergeOutboxIndex = merge.indexOf("insertOutbox({");
  const budgetOutboxIndex = merge.indexOf("insertOutbox(budgetMonthMutation)");
  const commitIndex = merge.indexOf('execute("COMMIT")');
  assert.ok(
    budgetWriteIndex > deleteIndex &&
      mergeOutboxIndex > budgetWriteIndex &&
      budgetOutboxIndex > mergeOutboxIndex &&
      commitIndex > budgetOutboxIndex,
    "merge effects, budget month, and both outbox rows must all precede the one COMMIT",
  );
});
