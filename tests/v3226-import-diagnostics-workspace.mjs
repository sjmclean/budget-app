import fs from "node:fs";

const diagnostics = fs.readFileSync("apps/web/src/features/accounts/transactionImportDiagnostics.ts", "utf8");
const page = fs.readFileSync("apps/web/src/pages/ImportDiagnosticsPage.tsx", "utf8");
const dialog = fs.readFileSync("apps/web/src/features/accounts/components/TransactionImportDialog.tsx", "utf8");
const router = fs.readFileSync("apps/web/src/app/router.tsx", "utf8");

for (const expected of [
  "listImportDiagnosticSessions",
  "recordImportDiagnosticSession",
  "deleteImportDiagnosticSession",
  "clearImportDiagnosticSessions",
  "MAX_SESSIONS = 50",
]) {
  if (!diagnostics.includes(expected)) throw new Error(`Missing diagnostics storage contract: ${expected}`);
}
if (!page.includes("useDeveloperPerformanceMode")) throw new Error("Diagnostics page is not developer gated.");
if (!page.includes("Copy JSON") || !page.includes("Export JSON")) throw new Error("Diagnostics export controls are missing.");
if (!page.includes("outcomeFilter") || !page.includes("statusFilter")) throw new Error("Diagnostics filters are missing.");
if (!dialog.includes("createImportDiagnosticSessionRecord") || !dialog.includes('status: "failed"')) throw new Error("Commit diagnostics are not persisted.");
if (!router.includes('/developer/import-diagnostics')) throw new Error("Diagnostics route is missing.");
console.log("v3.22.6 importer diagnostics workspace structure tests passed");
