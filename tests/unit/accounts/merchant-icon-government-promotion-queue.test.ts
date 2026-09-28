import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const generator = readFileSync("tools/merchant-icons/build-government-promotion-queue.ts", "utf8");

test("government promotion queue prioritises transaction-relevant public bodies", () => {
  assert.match(generator, /government-promotion-queue\.json/u);
  assert.match(generator, /readonly website\?: string/u);
  assert.match(generator, /CORE_PAYEE_IDENTITIES/u);
  assert.match(generator, /isCorePayee/u);
  assert.match(generator, /CORE_PAYEE_IDENTITIES\.has\(identity\)/u);
  assert.match(generator, /Australian Taxation Office/iu);
  assert.match(generator, /Internal Revenue Service/iu);
  assert.match(generator, /Social Security Administration/iu);
  assert.match(generator, /LOW_VALUE/u);
  assert.match(generator, /committee/u);
  assert.match(generator, /tribunal/u);
  assert.match(generator, /tax\|revenue\|treasury/u);
  assert.match(generator, /social security\|medicare\|centrelink/u);
  assert.match(generator, /births\?.*deaths\?.*marriages/u);
  assert.match(generator, /transport\|roads/u);
  assert.match(generator, /police\|sheriff\|coroner/u);
  assert.match(generator, /priorityScore >= 28/u);
  assert.match(generator, /slice\(0, 2500\)/u);
  assert.match(generator, /website/u);
  assert.match(generator, /school district/u);
  assert.match(generator, /replace\(\/\^u/u);
});
