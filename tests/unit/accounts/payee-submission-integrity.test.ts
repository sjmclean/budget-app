import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { resolvePayeeForSubmission } from "../../../apps/web/src/features/accounts/resolvePayeeForSubmission.js";

test("unknown payee resolves only when submission resolver is invoked", async () => {
  let calls = 0;

  const resolved = await resolvePayeeForSubmission(
    {
      payee: "  Ho   Hum Pty  ",
      payeeId: undefined,
    },
    async (name) => {
      calls += 1;
      assert.equal(name, "  Ho   Hum Pty  ");
      return {
        id: "payee-ho-hum",
        name: "Ho Hum Pty",
      };
    },
  );

  assert.equal(calls, 1);
  assert.equal(resolved.payee, "Ho Hum Pty");
  assert.equal(resolved.payeeId, "payee-ho-hum");
});

test("existing payee is not recreated during submission", async () => {
  let calls = 0;

  const resolved = await resolvePayeeForSubmission(
    {
      payee: "Existing Payee",
      payeeId: "existing-payee",
    },
    async () => {
      calls += 1;
      return {
        id: "should-not-be-used",
        name: "Should Not Be Used",
      };
    },
  );

  assert.equal(calls, 0);
  assert.equal(resolved.payeeId, "existing-payee");
});

test("transfer payee is never turned into a normal payee", async () => {
  let calls = 0;

  const resolved = await resolvePayeeForSubmission(
    {
      payee: "Transfer: Savings",
      transferAccountId: "savings",
    },
    async () => {
      calls += 1;
      return {
        id: "bad-payee",
        name: "Bad Payee",
      };
    },
  );

  assert.equal(calls, 0);
  assert.equal(resolved.payee, "Transfer: Savings");
  assert.equal(resolved.payeeId, undefined);
});

test("PayeeInput contains no payee persistence workflow", () => {
  const source = fs.readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/components/PayeeInput.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(source, /onCreatePayee/);
  assert.doesNotMatch(source, /Create payee/);
  assert.doesNotMatch(source, /Create “/);
});

test("scheduled transactions use the shared PayeeInput", () => {
  const source = fs.readFileSync(
    new URL(
      "../../../apps/web/src/components/accounts/ScheduledTransactionsPanel.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /<PayeeInput/);
  assert.doesNotMatch(source, /scheduled-payee-options/);
});

test("import review defers payee persistence until import commit", () => {
  const source = fs.readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(source, /onCreatePayee=\{onCreatePayee\}/);
  assert.match(source, /await commitImportSession\(/);
  assert.match(source, /resolvePayee:\s*async\s*\(/);
  assert.match(
    source,
    /commitTransactionBatch:\s*onCommitRegisterChanges/,
  );
});
