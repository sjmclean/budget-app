import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeYnabAmount,
  firstYnabDisplayAmount,
  parseYnabMilliunitAmount,
} from "../../../packages/ynab4-importer/src/money/decodeYnabAmount.js";

test("decodes explicit signed display-unit amounts before all fallbacks", () => {
  assert.equal(
    decodeYnabAmount({ amount: -12.34, amountMilliUnits: 999000, inflow: 1, outflow: 2 }),
    -12.34,
  );
});

test("decodes milliunits when an explicit display amount is absent", () => {
  assert.equal(decodeYnabAmount({ amountMilliUnits: -12340 }), -12.34);
  assert.equal(parseYnabMilliunitAmount("1,005"), 1.01);
});

test("treats inflow as positive and outflow as negative", () => {
  assert.equal(decodeYnabAmount({ inflow: 25 }), 25);
  assert.equal(decodeYnabAmount({ outflow: 25 }), -25);
  assert.equal(decodeYnabAmount({ inflow: -25 }), 25);
  assert.equal(decodeYnabAmount({ outflow: -25 }), -25);
});

test("prefers inflow over outflow when both legacy fields are present", () => {
  assert.equal(decodeYnabAmount({ inflow: 10, outflow: 20 }), 10);
});

test("parses formatted strings and rejects invalid values", () => {
  assert.equal(firstYnabDisplayAmount(undefined, "$1,234.56"), 1234.56);
  assert.equal(decodeYnabAmount({ amount: "not-money" }), null);
  assert.equal(decodeYnabAmount({}), null);
});
