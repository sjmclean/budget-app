import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMoneyExpression } from "../../../apps/web/src/features/money/moneyExpression.ts";

function value(input: string, base = 0) {
  const result = evaluateMoneyExpression(input, base);
  assert.equal(result.ok, true, `${input} should be valid`);
  return result.ok ? result.value : NaN;
}

test("evaluates replacement, formatted, relative, and full money expressions", () => {
  assert.equal(value("90"), 90);
  assert.equal(value("90.25"), 90.25);
  assert.equal(value("$1,200.50"), 1200.5);
  assert.equal(value("+1", 90), 91);
  assert.equal(value("-1", 90), 89);
  assert.equal(value("*2", 90), 180);
  assert.equal(value("/3", 90), 30);
  assert.equal(value("/3*2", 90), 60);
  assert.equal(value("90+1"), 91);
  assert.equal(value("100-12.5"), 87.5);
  assert.equal(value("20*1.1"), 22);
  assert.equal(value("100/4"), 25);
  assert.equal(value("2+3*4"), 14);
  assert.equal(value("(2+3)*4"), 20);
  assert.equal(value("5*-2"), -10);
  assert.equal(value("5++2"), 7);
  assert.equal(value(" - ( 2 + 3 ) ", 90), 85);
});

test("rejects complete malformed inputs and reports division by zero", () => {
  for (const input of ["", "hello", "90abc", "10/", "()", "2**3"]) {
    assert.equal(evaluateMoneyExpression(input).ok, false, input);
  }
  assert.deepEqual(evaluateMoneyExpression("1/0"), { ok: false, reason: "division-by-zero" });
});

test("normalises currency precision and rejects non-finite results", () => {
  assert.equal(value("10/3"), 3.33);
  assert.deepEqual(evaluateMoneyExpression(`${"9".repeat(400)}*2`), { ok: false, reason: "non-finite" });
});

test("a newly committed amount is the next session base", () => {
  const first = value("+1", 90);
  assert.equal(value("+1", first), 92);
});
