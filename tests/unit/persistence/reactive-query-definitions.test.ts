import assert from "node:assert/strict";
import test from "node:test";

import {
  categoryActivityDrilldownQuery,
  financialOverviewQuery,
  monthlyCategoryTransactionsQuery,
} from "../../../apps/web/src/features/persistence/reactiveQueries.js";
import {
  doesPersistenceChangeAffect,
  normalisePersistenceChange,
} from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";

const budgetId = "budget-a";
const month = "2026-09";
const categoryId = "category-a";

const payeeChange = normalisePersistenceChange({
  source: "local",
  scope: { budgetId, domains: ["payees"] },
});

test("payee changes invalidate cached query results that display denormalized payee names", () => {
  assert.equal(
    doesPersistenceChangeAffect(
      payeeChange,
      monthlyCategoryTransactionsQuery.interest({ budgetId, month, categoryId }),
    ),
    true,
  );
  assert.equal(
    doesPersistenceChangeAffect(
      payeeChange,
      categoryActivityDrilldownQuery.interest({ budgetId, month, categoryId }),
    ),
    true,
  );
  assert.equal(
    doesPersistenceChangeAffect(
      payeeChange,
      financialOverviewQuery.interest({ budgetId, month }),
    ),
    true,
  );
});
