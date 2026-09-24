import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialogSource = readFileSync(
  new URL("../../../apps/web/src/features/budget/BudgetMoveMoneyDialog.tsx", import.meta.url),
  "utf8",
);

test("Move Money is a generic destination plus multi-source workflow", () => {
  assert.match(dialogSource, /aria-label="Destination category"/);
  assert.match(dialogSource, /aria-label="Add source category"/);
  assert.match(dialogSource, /selectedSourceIds/);
  assert.match(dialogSource, /MoneyInput/);
  assert.match(dialogSource, /source\.available \+ 0\.000001/);
  assert.match(
    dialogSource,
    /onMoveMoney\(\{[\s\S]*destinationCategoryId: destination\.id,[\s\S]*sources: selectedSourceAmounts/,
  );
  assert.doesNotMatch(dialogSource, /overspent|overspending/i);
});

test("Move Money excludes archived and managed credit-card payment categories", () => {
  assert.match(
    dialogSource,
    /!category\.isArchived[\s\S]*!isCreditCardPaymentCategory\(category\.id\)/,
  );
  assert.match(dialogSource, /!isCreditCardPaymentGroup\(group\.id\)/);
});

test("Move Money validates every source contribution against Available", () => {
  assert.match(
    dialogSource,
    /amount > source\.available \+ 0\.000001/,
  );
  assert.match(
    dialogSource,
    /A source cannot contribute more than its available amount/,
  );
  assert.match(
    dialogSource,
    /selectedSourceAmounts\.length > 0[\s\S]*selectedTotal > 0[\s\S]*!sourceHasError/,
  );
});
