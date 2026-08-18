import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyPersistedImportTransactions,
} from "../../../apps/web/src/features/accounts/transactionImportVerification.js";

test("import verification accepts a persisted transfer when its display payee is derived differently", () => {
  verifyPersistedImportTransactions(
    [
      {
        id: "import-transfer-1",
        date: "2026-08-18",
        inflow: 0,
        outflow: 125,
        payee: "Transfer: NAB Offset",
        rawPayee: "TRANSFER TO OFFSET",
        transferAccountId: "nab-offset",
      },
    ],
    [
      {
        id: "import-transfer-1",
        date: "2026-08-18",
        inflow: 0,
        outflow: 125,
        payee: "Transfer: Unknown account",
        rawPayee: "TRANSFER TO OFFSET",
        transferAccountId: "nab-offset",
      },
    ],
  );
});

test("import verification still rejects a transfer persisted to the wrong account", () => {
  assert.throws(
    () =>
      verifyPersistedImportTransactions(
        [
          {
            id: "import-transfer-1",
            date: "2026-08-18",
            inflow: 0,
            outflow: 125,
            payee: "Transfer: NAB Offset",
            rawPayee: "TRANSFER TO OFFSET",
            transferAccountId: "nab-offset",
          },
        ],
        [
          {
            id: "import-transfer-1",
            date: "2026-08-18",
            inflow: 0,
            outflow: 125,
            payee: "Transfer: Unknown account",
            rawPayee: "TRANSFER TO OFFSET",
            transferAccountId: "different-account",
          },
        ],
      ),
    /differs from the reviewed commit plan/i,
  );
});

test("ordinary import verification still requires the reviewed payee", () => {
  assert.throws(
    () =>
      verifyPersistedImportTransactions(
        [
          {
            id: "import-normal-1",
            date: "2026-08-18",
            inflow: 0,
            outflow: 25,
            payee: "Woolworths",
            rawPayee: "WOOLWORTHS 1234",
          },
        ],
        [
          {
            id: "import-normal-1",
            date: "2026-08-18",
            inflow: 0,
            outflow: 25,
            payee: "Different Payee",
            rawPayee: "WOOLWORTHS 1234",
          },
        ],
      ),
    /differs from the reviewed commit plan/i,
  );
});
