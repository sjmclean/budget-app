import assert from "node:assert/strict";
import test from "node:test";

import { auditYnab4ImportedPayeeProvenance } from "../../../apps/web/src/features/budget/ynab4ImportedPayeeProvenanceAudit.js";

test("reports imported-payee provenance fidelity separately from financial totals", () => {
  const audit = auditYnab4ImportedPayeeProvenance(
    [
      { entityId: "kept", importedPayee: "  BANK DESCRIPTION  " },
      { entityId: "lost", importedPayee: "OTHER BANK DESCRIPTION" },
      { entityId: "blank", importedPayee: "   " },
    ],
    [
      { id: "kept", rawPayee: "BANK DESCRIPTION" },
      { id: "lost", payee: "Visible Payee" },
    ] as never,
  );

  assert.equal(audit.sourceTransactionsWithImportedPayee, 2);
  assert.equal(audit.preservedRawPayees, 1);
  assert.equal(audit.mismatches.length, 1);
  assert.match(audit.mismatches[0] ?? "", /lost/);
});
