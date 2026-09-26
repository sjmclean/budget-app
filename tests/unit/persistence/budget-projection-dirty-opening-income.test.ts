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

test("a dirty projection anchor recomputes income from current transactions", () => {
  assert.match(
    workerSource,
    /const snapshotIncome = dirtyMonth === firstMonth\s*\? currentFirstIncome\s*: Number\.isFinite\(firstSnapshot\.incomeForMonth\)[\s\S]*?: currentFirstIncome;/,
    "dirty anchor months must use current transaction income instead of a stale snapshot value",
  );
});
