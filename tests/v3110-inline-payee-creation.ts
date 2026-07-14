import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const payeeInput = readFileSync(
  "apps/web/src/features/accounts/components/PayeeInput.tsx",
  "utf8",
);
const editor = readFileSync(
  "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  "utf8",
);
const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const workflow = readFileSync(
  "apps/web/src/features/accounts/usePayeeManagerWorkflow.ts",
  "utf8",
);

assert(
  payeeInput.includes("onCreatePayee?: (name: string) => Promise<PayeeView>") &&
    payeeInput.includes("Create “{trimmedValue}”") &&
    payeeInput.includes("submitCreatePayee"),
  "Payee autocomplete must support inline creation",
);
assert(
  payeeInput.includes('startsWith("transfer:")'),
  "Inline creation must not replace transfer-account suggestions",
);
assert(
  workflow.includes("createInlinePayee") &&
    workflow.includes("payeesPersistence.recordPayee(normalisedName)"),
  "Inline payees must be persisted through the existing payee gateway",
);
assert(
  editor.match(/onCreatePayee=\{onCreatePayee\}/g)?.length === 2,
  "Both add and edit transaction payee inputs must support inline creation",
);
assert(
  page.includes("onCreatePayee={createInlinePayee}"),
  "Register page must connect inline creation to the payee workflow",
);

console.log("v3.11 inline Register payee creation checks passed.");
