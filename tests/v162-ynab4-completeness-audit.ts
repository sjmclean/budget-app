import assert from "node:assert/strict";
import { assessYnab4ImportCompleteness } from "../packages/ynab4-importer/src/assessYnab4ImportCompleteness.js";

const audit = assessYnab4ImportCompleteness();

assert.equal(audit.title, "YNAB4 Import Completeness Audit");
assert.ok(audit.summary.total >= 12, "audit should cover the major YNAB4 migration areas");
assert.ok(audit.summary.requiredBlockers >= 8, "full import should still have required blockers before writes begin");
assert.ok(audit.summary.criticalBlockers >= 4, "critical blockers should be explicitly surfaced");

const byId = new Map(audit.items.map((item) => [item.id, item]));

assert.equal(byId.get("category-groups")?.status, "missing");
assert.equal(byId.get("category-groups")?.requiredBeforeFullImport, true);
assert.match(byId.get("category-groups")?.recommendedAction ?? "", /CategoryGroupSettings|category groups/i);

assert.equal(byId.get("transaction-check-numbers")?.status, "missing");
assert.equal(byId.get("transaction-check-numbers")?.requiredBeforeFullImport, true);
assert.match(byId.get("transaction-check-numbers")?.importImpact ?? "", /lost/i);

assert.equal(byId.get("scheduled-transactions")?.status, "partial");
assert.equal(byId.get("scheduled-transactions")?.requiredBeforeFullImport, true);
assert.match(byId.get("scheduled-transactions")?.recommendedAction ?? "", /scheduled split/i);

assert.equal(byId.get("budget-month-history")?.risk, "critical");
assert.equal(byId.get("transfers")?.risk, "critical");
assert.equal(byId.get("credit-cards")?.risk, "critical");

assert.ok(
  audit.recommendedBuildOrder.some((step) => /category group/i.test(step)),
  "category group notes should be one of the first build items"
);
assert.ok(
  audit.recommendedBuildOrder.some((step) => /check-number/i.test(step)),
  "check-number preservation should be an explicit build item"
);

console.log("v1.62 YNAB4 completeness audit checks passed");
