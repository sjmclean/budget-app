import {
  validateTransfer,
  validateFutureMonth,
  validateTransaction,
} from "../packages/budget-engine/src/index.js";
import { ClearedStatus } from "../packages/types/src/ClearedStatus.js";
import { TransactionType } from "../packages/types/src/TransactionType.js";

function assertThrows(label: string, fn: () => void): void {
  try {
    fn();
  } catch {
    console.log(`PASS: ${label}`);
    return;
  }

  throw new Error(`Expected validation failure: ${label}`);
}

validateTransfer("checking", "savings", 1000);
console.log("PASS: valid transfer accepted");

assertThrows("same-account transfer rejected", () =>
  validateTransfer("checking", "checking", 1000),
);
assertThrows("zero-value transfer rejected", () =>
  validateTransfer("checking", "savings", 0),
);
assertThrows("negative transfer rejected", () =>
  validateTransfer("checking", "savings", -1),
);

validateFutureMonth("2026-08", "2026-06", 3);
console.log("PASS: valid future month accepted");
assertThrows("future month beyond configured limit rejected", () =>
  validateFutureMonth("2027-06", "2026-06", 3),
);

validateTransaction({
  id: "tx-valid",
  budgetId: "budget-1",
  accountId: "account-1",
  payeeId: null,
  categoryId: "category-1",
  transferAccountId: null,
  type: TransactionType.Standard,
  date: "2026-06-17",
  memo: "Groceries",
  amount: -2500,
  clearedStatus: ClearedStatus.Uncleared,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});
console.log("PASS: valid transaction accepted");

assertThrows("spending transaction without category rejected", () =>
  validateTransaction({
    id: "tx-invalid",
    budgetId: "budget-1",
    accountId: "account-1",
    payeeId: null,
    categoryId: null,
    transferAccountId: null,
    type: TransactionType.Standard,
    date: "2026-06-17",
    memo: "Missing category",
    amount: -2500,
    clearedStatus: ClearedStatus.Uncleared,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
);

console.log("v1.1 validation layer OK");
