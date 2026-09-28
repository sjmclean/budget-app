import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const audit = readFileSync("tools/merchant-icons/audit-government-candidates.ts", "utf8");

test("government candidate audit checks quality and priority coverage deterministically", () => {
  assert.match(audit, /government-candidates\.json/u);
  assert.match(audit, /exactNavigationNoiseCount/u);
  assert.match(audit, /duplicateCanonicalNameCount/u);
  assert.match(audit, /Australian Taxation Office/u);
  assert.match(audit, /HM Revenue and Customs/u);
  assert.match(audit, /Internal Revenue Service/u);
  assert.match(audit, /Births Deaths and Marriages/u);
  assert.match(audit, /Driver and Vehicle Licensing Agency/u);
  assert.match(audit, /Department of Motor Vehicles/u);
});
