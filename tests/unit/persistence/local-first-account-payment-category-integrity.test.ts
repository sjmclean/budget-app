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

test("account upserts reconcile managed credit-card payment categories", () => {
  assert.match(
    worker,
    /function reconcileCreditCardPaymentCategoryForAccount\s*\(/,
    "account writes need one shared credit-card payment-category reconciliation helper",
  );

  const helper = functionBody("reconcileCreditCardPaymentCategoryForAccount");

  assert.match(
    helper,
    /credit-card-payment-/,
    "managed payment category ID must derive from the account ID",
  );

  assert.match(
    helper,
    /credit-card-payments/,
    "managed payment category must use the credit-card payment group",
  );

  assert.match(
    helper,
    /local_budget_months/,
    "account changes must reconcile authoritative budget snapshots",
  );

  assert.match(
    helper,
    /view_json/,
    "account changes must rewrite persisted snapshot category state",
  );

  assert.match(
    helper,
    /local_categories/,
    "account changes must reconcile normalized category state",
  );

  assert.match(
    helper,
    /local_budget_assignments/,
    "removing payment-category state must handle persisted assignments",
  );

  assert.match(
    helper,
    /local_budget_category_policies/,
    "removing unused payment-category state must handle persisted category policies",
  );

  assert.match(
    helper,
    /CREDIT_CARD_PAYMENT_CATEGORY_IN_USE/,
    "type changes must refuse to discard meaningful payment-category budget state",
  );

  assert.match(
    helper,
    /previousAvailable|assigned|activity|available/,
    "payment-category use detection must inspect persisted financial state",
  );

  assert.match(
    helper,
    /account\.name/,
    "credit-card rename must refresh the managed category name",
  );

  assert.match(
    helper,
    /account\.type\s*===\s*"credit-card"/,
    "reconciliation must distinguish credit-card from non-credit-card accounts",
  );

  assert.match(
    helper,
    /\.\.\.group/,
    "snapshot reconciliation must preserve unrelated group fields",
  );

  assert.match(
    helper,
    /\.\.\.category/,
    "snapshot reconciliation must preserve existing managed-category fields on rename",
  );

  assert.match(
    helper,
    /totalAssigned/,
    "snapshot aggregate assigned total must be recomputed after reconciliation",
  );

  assert.match(
    helper,
    /totalActivity/,
    "snapshot aggregate activity total must be recomputed after reconciliation",
  );

  assert.match(
    helper,
    /totalAvailable/,
    "snapshot aggregate available total must be recomputed after reconciliation",
  );

  const localWrite = functionBody("writeAccount");
  assert.match(
    localWrite,
    /reconcileCreditCardPaymentCategoryForAccount\s*\(\s*account\s*\)/,
    "local account writes must reconcile managed payment categories atomically",
  );

  const remoteAccountReplay = worker.match(
    /mutation\.domain === "accounts"[\s\S]*?markAllBudgetProjectionsDirty\(\);/,
  )?.[0];

  assert.ok(remoteAccountReplay, "remote account replay block must exist");
  assert.match(
    remoteAccountReplay,
    /reconcileCreditCardPaymentCategoryForAccount\s*\(\s*account\s*\)/,
    "remote account upserts must use the same reconciliation",
  );
});
