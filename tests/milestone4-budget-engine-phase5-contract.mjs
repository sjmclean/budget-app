import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const engine = readFileSync("packages/budget-engine/src/projection/projectBudget.ts", "utf8");
const reconciliation = readFileSync("packages/budget-engine/src/projection/reconcileBudgetProjection.ts", "utf8");
const worker = readFileSync("apps/web/src/features/persistence/localFirst/localBudget.worker.ts", "utf8");
const schema = readFileSync("apps/web/src/features/persistence/localFirst/registerSchema.ts", "utf8");

assert.match(engine, /creditCardPolicy\?: "manual" \| "payment-funding"/);
assert.match(engine, /function applyCreditCardPaymentFunding/);
assert.match(engine, /Math\.min\(-amount, Math\.max\(0, before\)\)/);
assert.match(reconciliation, /export function reconcileBudgetProjection/);
assert.match(worker, /BUDGET_PROJECTION_ENGINE_VERSION = 5/);
assert.match(worker, /credit-card-payment-/);
assert.match(schema, /local_transaction_splits_category/);

console.log("Milestone 4 Phase 5 structural contracts passed.");
