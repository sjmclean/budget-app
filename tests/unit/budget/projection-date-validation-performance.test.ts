import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL(
    "../../../packages/budget-engine/src/projection/projectBudget.ts",
    import.meta.url,
  ),
  "utf8",
);

function validatorBody(): string {
  const match = source.match(
    /function requireTransactionMonth\([\s\S]*?\n\}/,
  );

  assert.ok(match, "requireTransactionMonth should exist");
  return match[0];
}

test("transaction date validation avoids Date object construction", () => {
  const body = validatorBody();

  assert.doesNotMatch(
    body,
    /new Date\s*\(/,
    "projection date validation should not allocate Date objects per transaction",
  );

  assert.doesNotMatch(
    body,
    /Date\.UTC\s*\(/,
    "projection date validation should not use Date.UTC per transaction",
  );
});

test("transaction date validation avoids split-and-map parsing", () => {
  const body = validatorBody();

  assert.doesNotMatch(
    body,
    /\.split\("-"\)\.map\(Number\)/,
    "projection date validation should avoid allocating split arrays per transaction",
  );

  assert.match(
    body,
    /charCodeAt\(/,
    "projection date validation should parse fixed ISO digits directly",
  );
});

test("transaction date validation still checks leap years and month lengths", () => {
  const body = validatorBody();

  assert.match(
    body,
    /year\s*%\s*4/,
    "projection date validation should retain leap-year validation",
  );

  assert.match(
    body,
    /year\s*%\s*100/,
    "projection date validation should retain century leap-year validation",
  );

  assert.match(
    body,
    /year\s*%\s*400/,
    "projection date validation should retain 400-year leap-year validation",
  );

  assert.match(
    body,
    /month\s*===\s*2/,
    "projection date validation should retain February handling",
  );

  assert.match(
    body,
    /day\s*>\s*daysInMonth/,
    "projection date validation should reject impossible calendar days",
  );
});
