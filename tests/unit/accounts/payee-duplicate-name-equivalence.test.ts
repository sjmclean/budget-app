import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arePayeeNamesStrictlyEquivalent,
  buildDuplicateGroupSuppressions,
  normaliseStrictPayeeName,
} from "../../../apps/web/src/features/accounts/payeeRecognition.ts";

test("strict payee-name equivalence ignores case and surrounding whitespace", () => {
  assert.equal(arePayeeNamesStrictlyEquivalent("CASH", "Cash"), true);
  assert.equal(arePayeeNamesStrictlyEquivalent(" CASH ", "CAsh"), true);
});

test("strict payee-name equivalence collapses repeated whitespace", () => {
  assert.equal(
    arePayeeNamesStrictlyEquivalent(
      "MY   LOCAL   SHOP",
      "my local shop",
    ),
    true,
  );
});

test("strict payee-name equivalence accepts canonical Unicode spelling", () => {
  assert.equal(
    arePayeeNamesStrictlyEquivalent("Café", "Cafe\u0301"),
    true,
  );
});

test("strict payee-name equivalence does not fold compatibility characters", () => {
  assert.equal(
    arePayeeNamesStrictlyEquivalent("ＡＣＭＥ", "ACME"),
    false,
  );
});

test("strict payee-name equivalence preserves punctuation differences", () => {
  assert.equal(
    arePayeeNamesStrictlyEquivalent("A.B. Services", "AB Services"),
    false,
  );
  assert.equal(
    arePayeeNamesStrictlyEquivalent("Smith & Jones", "Smith Jones"),
    false,
  );
});

test("strict payee-name normalisation does not treat blank names as equivalent", () => {
  assert.equal(normaliseStrictPayeeName("   "), "");
  assert.equal(arePayeeNamesStrictlyEquivalent("   ", ""), false);
});


test("ignoring a duplicate group suppresses every pair in the group", () => {
  assert.deepEqual(
    buildDuplicateGroupSuppressions(["cash-c", "cash-a", "cash-b"]),
    [
      { leftPayeeId: "cash-a", rightPayeeId: "cash-b" },
      { leftPayeeId: "cash-a", rightPayeeId: "cash-c" },
      { leftPayeeId: "cash-b", rightPayeeId: "cash-c" },
    ],
  );
});

test("duplicate-group suppression ignores repeated payee ids", () => {
  assert.deepEqual(
    buildDuplicateGroupSuppressions(["cash-a", "cash-a", "cash-b"]),
    [
      { leftPayeeId: "cash-a", rightPayeeId: "cash-b" },
    ],
  );
});
