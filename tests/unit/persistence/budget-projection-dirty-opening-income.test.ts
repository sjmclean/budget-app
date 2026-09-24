import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workerSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("a dirty projection anchor does not treat newly changed income as part of the old snapshot", () => {
  assert.match(
    workerSource,
    /const snapshotIncome = Number\.isFinite\(firstSnapshot\.incomeForMonth\)[\s\S]*?: dirtyMonth === firstMonth \? 0 : currentFirstIncome;/,
    "dirty anchor snapshots without incomeForMonth must use their pre-change zero baseline",
  );
});
