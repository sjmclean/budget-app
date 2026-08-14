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

test("payment funding does not rescan all transactions for every account and month", () => {
  const match = source.match(
    /function applyCreditCardPaymentFunding\(([\s\S]*?)\n\}/,
  );

  assert.ok(match, "applyCreditCardPaymentFunding should exist");

  const body = match[1];

  assert.doesNotMatch(
    body,
    /input\.accounts\.map\([\s\S]*?input\.transactions\.reduce\(/,
    "payment funding should not rebuild each account balance by scanning every transaction",
  );

  assert.doesNotMatch(
    body,
    /input\.transactions\s*\.filter\([\s\S]*?date\.slice\(0,\s*7\)\s*===\s*month/,
    "payment funding should consume pre-indexed monthly transactions",
  );
});

test("projection pre-indexes transactions by month before replay", () => {
  const projectMatch = source.match(
    /export function projectBudget\([\s\S]*?\n\}/,
  );

  assert.ok(projectMatch, "projectBudget should exist");

  const body = projectMatch[0];

  const loopOffset = body.indexOf(
    "for (const [monthIndex, month] of months.entries())",
  );

  assert.notEqual(loopOffset, -1, "projection month loop should exist");

  const beforeLoop = body.slice(0, loopOffset);

  assert.match(
    beforeLoop,
    /indexTransactionsByMonth\(input\.transactions\)/,
    "payment funding should index transactions by month once before replay",
  );

  assert.match(
    beforeLoop,
    /new Map\(\s*input\.accounts\.map/,
    "payment funding should initialise running account balances once before replay",
  );
});
