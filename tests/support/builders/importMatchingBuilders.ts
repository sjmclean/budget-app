import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes";
import type { ParsedImportTransaction } from "../../../apps/web/src/features/accounts/transactionImportParser";

export function buildRegisterTransaction(
  overrides: Partial<RegisterTransactionView> = {},
): RegisterTransactionView {
  return {
    id: "register-1",
    date: "2026-06-30",
    payee: "Example merchant",
    category: "Uncategorised",
    memo: "",
    checkNumber: "",
    outflow: 10,
    inflow: 0,
    cleared: false,
    reconciled: false,
    flag: null,
    attachmentCount: 0,
    runningBalance: 0,
    ...overrides,
  };
}

export function buildParsedImportTransaction(
  overrides: Partial<ParsedImportTransaction> = {},
): ParsedImportTransaction {
  return {
    rowNumber: 2,
    date: "2026-06-30",
    payee: "Example merchant",
    memo: "",
    outflow: 10,
    inflow: 0,
    raw: {},
    ...overrides,
  };
}
