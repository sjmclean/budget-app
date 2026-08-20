import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialog = readFileSync(
  new URL(
    "../../../apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("post-commit import projection verification is diagnostic-only", () => {
  const adapterStart = dialog.indexOf(
    "verifyCommittedTransactions: async (accountId, additions) => {",
  );
  const adapterEnd = dialog.indexOf(
    "\n          addTransactions:",
    adapterStart,
  );

  assert.ok(adapterStart >= 0, "post-commit verifier adapter must exist");
  assert.ok(adapterEnd > adapterStart, "verifier adapter boundary must be discoverable");

  const adapter = dialog.slice(adapterStart, adapterEnd);

  const tryStart = adapter.indexOf("try {");
  const load = adapter.indexOf(
    "await loadTransactionsByIds(accountId, ids)",
  );
  const verify = adapter.indexOf(
    "verifyPersistedImportTransactions(additions, persisted)",
  );
  const catchStart = adapter.indexOf("} catch (error) {");

  assert.ok(tryStart >= 0, "diagnostic read/check must be guarded");
  assert.ok(
    load > tryStart && load < catchStart,
    "post-commit transaction reload must be inside the diagnostic try block",
  );
  assert.ok(
    verify > load && verify < catchStart,
    "projection comparison must be inside the diagnostic try block",
  );
  assert.match(
    adapter,
    /console\.warn\(/,
    "projection disagreement should be reported diagnostically",
  );
});
