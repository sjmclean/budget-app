import assert from "node:assert/strict";
import test from "node:test";

import {
  followingBudgetMonth,
  requireCanonicalInflowSemantics,
  validGeneralIncomeBudgetMonth,
} from "../../../apps/web/src/features/accounts/incomeTransactionSemantics.js";

test("general income may target exactly the transaction month or following month", () => {
  assert.equal(validGeneralIncomeBudgetMonth("2026-09-25", "2026-09"), true);
  assert.equal(validGeneralIncomeBudgetMonth("2026-09-25", "2026-10"), true);
  assert.equal(validGeneralIncomeBudgetMonth("2026-09-25", "2026-08"), false);
  assert.equal(validGeneralIncomeBudgetMonth("2026-09-25", "2026-11"), false);
  assert.equal(followingBudgetMonth("2026-12"), "2027-01");
});

test("general income is explicit, uncategorised and classified as income", () => {
  assert.deepEqual(
    requireCanonicalInflowSemantics({
      date: "2026-09-25",
      amount: 500000,
      incomeBudgetMonth: "2026-10",
      inflowClassification: "income",
    }),
    {
      incomeBudgetMonth: "2026-10",
      inflowClassification: "income",
    },
  );

  assert.throws(
    () => requireCanonicalInflowSemantics({
      date: "2026-09-25",
      amount: 500000,
      categoryId: "groceries",
      incomeBudgetMonth: "2026-10",
      inflowClassification: "income",
    }),
    /cannot also target an ordinary category/,
  );

  assert.throws(
    () => requireCanonicalInflowSemantics({
      date: "2026-09-25",
      amount: 500000,
      incomeBudgetMonth: "2026-11",
      inflowClassification: "income",
    }),
    /transaction month or the following month/,
  );
});

test("direct-category inflows distinguish income from refunds", () => {
  assert.deepEqual(
    requireCanonicalInflowSemantics({
      date: "2026-09-25",
      amount: 50000,
      categoryId: "groceries",
      inflowClassification: "income",
    }),
    {
      incomeBudgetMonth: null,
      inflowClassification: "income",
    },
  );

  assert.deepEqual(
    requireCanonicalInflowSemantics({
      date: "2026-09-25",
      amount: 5000,
      categoryId: "groceries",
      inflowClassification: "category-inflow",
    }),
    {
      incomeBudgetMonth: null,
      inflowClassification: "category-inflow",
    },
  );

  assert.throws(
    () => requireCanonicalInflowSemantics({
      date: "2026-09-25",
      amount: 5000,
      categoryId: "groceries",
    }),
    /requires an explicit inflow classification/,
  );
});

test("uncategorised inflows, outflows and transfers cannot masquerade as income", () => {
  assert.deepEqual(
    requireCanonicalInflowSemantics({
      date: "2026-09-25",
      amount: 5000,
    }),
    {
      incomeBudgetMonth: null,
      inflowClassification: null,
    },
  );

  assert.throws(
    () => requireCanonicalInflowSemantics({
      date: "2026-09-25",
      amount: 5000,
      inflowClassification: "income",
    }),
    /uncategorised inflow/,
  );

  assert.throws(
    () => requireCanonicalInflowSemantics({
      date: "2026-09-25",
      amount: -5000,
      inflowClassification: "income",
    }),
    /Outflows and transfers/,
  );

  assert.throws(
    () => requireCanonicalInflowSemantics({
      date: "2026-09-25",
      amount: 5000,
      transferAccountId: "savings",
      inflowClassification: "income",
    }),
    /Outflows and transfers/,
  );
});
