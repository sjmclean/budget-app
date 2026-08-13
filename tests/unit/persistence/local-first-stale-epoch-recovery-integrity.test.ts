import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
    import.meta.url,
  ),
  "utf8",
);

const readyStart = source.indexOf(
  "async function readyDatabase(budgetId: string)",
);
assert.notEqual(readyStart, -1);

const readyEnd = source.indexOf(
  "async function requireDatabase(",
  readyStart,
);
assert.notEqual(readyEnd, -1);

const readyBody = source.slice(readyStart, readyEnd);

test("unexpected stale epoch cannot bootstrap an uninspected local generation", () => {
  assert.match(
    readyBody,
    /let\s+oldGenerationProvenSafe\s*=\s*false/,
    "readyDatabase must track whether the previous generation was explicitly proven safe",
  );

  assert.match(
    readyBody,
    /pendingOldGeneration[\s\S]*?length\s*>\s*0[\s\S]*?UNSYNCED_LOCAL_CHANGES[\s\S]*?oldGenerationProvenSafe\s*=\s*true/,
    "the previous generation may only be marked safe after its outbox is inspected and found empty",
  );

  const staleCatch = readyBody.slice(
    readyBody.indexOf(
      'if ((error as { code?: string }).code === "STALE_SYNC_EPOCH")',
    ),
  );

  assert.match(
    staleCatch,
    /if\s*\(\s*!oldGenerationProvenSafe\s*\)[\s\S]*?UNVERIFIED_STALE_LOCAL_GENERATION/,
    "an unexpected stale epoch must fail unless the old generation was proven safe",
  );

  assert.match(
    staleCatch,
    /oldGenerationProvenSafe[\s\S]*?bootstrapLocalBudget\s*\(/,
    "destructive stale-epoch bootstrap must be gated by the proven-safe state",
  );
});
