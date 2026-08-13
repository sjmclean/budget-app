import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const importerSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/budget/actualBudgetLauncherImport.ts",
    import.meta.url,
  ),
  "utf8",
);

const workerSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("Actual Budget import must not create a zero Ready-to-Assign anchor for every month", () => {
  const start = importerSource.indexOf("function mapActualBudgetMonthViews(");
  assert.notEqual(start, -1);

  const end = importerSource.indexOf(
    "interface ActualBudgetCategoryMonthData",
    start,
  );
  assert.notEqual(end, -1);

  const body = importerSource.slice(start, end);

  assert.doesNotMatch(
    body,
    /readyToAssign:\s*0\b/,
    "Actual import must derive Ready to Assign rather than hard-code zero",
  );
});

test("projection fallback treats snapshot Ready-to-Assign as financial anchor evidence", () => {
  const start = workerSource.indexOf("function getBudgetProjectionDiagnostic(");
  assert.notEqual(start, -1);

  const end = workerSource.indexOf("function readBudgetMonth(", start);
  assert.notEqual(end, -1);

  const body = workerSource.slice(start, end);

  assert.match(body, /toMinorUnits\(firstSnapshot\.readyToAssign\)/);
  assert.match(
    body,
    /openingReadyToAssign\s*=\s*snapshotCarriedForward/,
  );
});

test("Actual import distinguishes source income categories from genuinely uncategorised transactions", () => {
  assert.match(
    importerSource,
    /readyToAssignCategorySourceIds/,
    "the importer needs durable knowledge of source categories that mean income/Ready to Assign",
  );

  assert.match(
    importerSource,
    /resolveActualTransactionCategory/,
    "transaction category classification should be explicit instead of treating every unmapped category as RTA",
  );
});

test("Actual import must not default every unmapped transaction category to Ready to Assign", () => {
  const start = importerSource.indexOf("function mapActualRegisterTransaction(");
  assert.notEqual(start, -1);

  const end = importerSource.indexOf(
    "function mapActualSplitLines(",
    start,
  );
  assert.notEqual(end, -1);

  const body = importerSource.slice(start, end);

  assert.doesNotMatch(
    body,
    /categoryId:\s*splitLines\.length\s*>\s*0\s*\?\s*undefined\s*:\s*categoryId\s*\?\?\s*READY_TO_ASSIGN_CATEGORY_ID/,
    "an absent/unusable source category must remain uncategorised unless it is known source income",
  );
});

test("Actual carryover rows preserve carry-category overspending policy", () => {
  const start = importerSource.indexOf("function mapActualBudgetMonthViews(");
  assert.notEqual(start, -1);

  const end = importerSource.indexOf(
    "interface ActualBudgetCategoryMonthData",
    start,
  );
  assert.notEqual(end, -1);

  const body = importerSource.slice(start, end);

  assert.match(
    body,
    /overspendingHandling\s*=\s*nextBudgetData\?\.carryover\s*\?\s*"carry-category"\s*:\s*"reduce-next-month"/,
    "Actual carryover semantics must survive normalization into the budget projection policy",
  );
});
