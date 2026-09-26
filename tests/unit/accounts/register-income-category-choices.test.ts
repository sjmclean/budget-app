import assert from "node:assert/strict";
import test from "node:test";
import {
  registerIncomeCategoryChoices,
  registerIncomeCategoryValue,
  resolveRegisterIncomeCategoryChoice,
} from "../../../apps/web/src/features/accounts/registerIncomeCategoryChoices";

test("register income choices expose only transaction and following month", () => {
  assert.deepEqual(
    registerIncomeCategoryChoices("2026-09-26"),
    [
      {
        id: "__income_for__:2026-09",
        value: "Income for September 2026",
        incomeBudgetMonth: "2026-09",
      },
      {
        id: "__income_for__:2026-10",
        value: "Income for October 2026",
        incomeBudgetMonth: "2026-10",
      },
    ],
  );
});

test("register income choice resolution rejects arbitrary later months", () => {
  assert.equal(
    resolveRegisterIncomeCategoryChoice("Income for October 2026", "2026-09-26")
      ?.incomeBudgetMonth,
    "2026-10",
  );
  assert.equal(
    resolveRegisterIncomeCategoryChoice("Income for November 2026", "2026-09-26"),
    null,
  );
});

test("canonical income metadata maps back to the synthetic register label", () => {
  assert.equal(
    registerIncomeCategoryValue("2026-09-26", "2026-10"),
    "Income for October 2026",
  );
  assert.equal(
    registerIncomeCategoryValue("2026-09-26", "2026-11"),
    null,
  );
});
