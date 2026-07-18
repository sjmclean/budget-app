import assert from "node:assert/strict";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes.js";
import {
  assessTransactionImportMatch,
  type ParsedImportTransaction,
} from "../apps/web/src/features/accounts/transactionImport.js";

function existing(id: string, date: string, payee: string, outflow: number): RegisterTransactionView {
  return {
    id, date, payee, category: "Uncategorised", memo: "", checkNumber: "",
    outflow, inflow: 0, cleared: false, reconciled: false, flag: null,
    attachmentCount: 0, runningBalance: 0,
  };
}

function imported(date: string, payee: string, outflow: number): ParsedImportTransaction {
  return { rowNumber: 2, date, payee, memo: "", outflow, inflow: 0, raw: {} };
}

const cases = [
  ["2026-07-16", "Harvey Norman Online Homebus", 143.95, "2026-07-14", "Harvey Norman Online"],
  ["2026-07-14", "Belong", 25, "2026-07-12", "Belong Mobile"],
  ["2026-07-14", "KAI MOOK THAI RESTAURA LOWER P", 52.32, "2026-07-12", "Kai Mook Thai"],
  ["2026-07-14", "YARRAVALLEYWATER YVOW MITCHA", 479.32, "2026-07-10", "Yarra Valley Water"],
] as const;

for (const [importDate, importPayee, amount, existingDate, existingPayee] of cases) {
  const result = assessTransactionImportMatch(
    imported(importDate, importPayee, amount),
    [existing(existingPayee, existingDate, existingPayee, amount)],
  );
  assert.equal(result.status, "possible-match", `${importPayee} should be a possible match`);
  assert.ok((result.selectedCandidate?.payeeSimilarity ?? 0) >= 60);
}

for (const [shortName, longName] of [["Cafe", "Cafe Metro"], ["Shop", "Shop Central"]] as const) {
  const result = assessTransactionImportMatch(
    imported("2026-07-14", shortName, 10),
    [existing(longName, "2026-07-12", longName, 10)],
  );
  assert.equal(result.status, "new", `${shortName} is too generic to infer a merchant-root match`);
}

console.log("v3.18.3 noisy merchant-root matching checks passed");
