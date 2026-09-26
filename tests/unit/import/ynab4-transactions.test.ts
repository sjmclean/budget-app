import assert from "node:assert/strict";
import test from "node:test";

import { mapYnab4Transactions } from "../../../apps/web/src/features/budget/ynab4/mapYnab4Transactions.js";

const accounts = [
  {
    id: "checking",
    name: "Checking",
    type: "on-budget" as const,
    startingBalance: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "savings",
    name: "Savings",
    type: "on-budget" as const,
    startingBalance: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const maps = {
  accountIdBySourceId: new Map([
    ["source-checking", "checking"],
    ["source-savings", "savings"],
  ]),
  accountNameById: new Map([
    ["checking", "Checking"],
    ["savings", "Savings"],
  ]),
  accountTypeById: new Map([
    ["checking", "on-budget" as const],
    ["savings", "on-budget" as const],
  ]),
  categoryIdBySourceId: new Map([["source-groceries", "groceries"]]),
  categoryNameById: new Map([["groceries", "Groceries"]]),
  payeeIdBySourceId: new Map([["source-shop", "shop"]]),
  payeeNameById: new Map([["shop", "Local Shop"]]),
};

test("maps ordinary transactions, balances, categories, payees, and flags", () => {
  const registers = mapYnab4Transactions({
    accounts,
    maps,
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map([["red", "red-flag"]]),
    transactions: [
      {
        entityId: "txn-1",
        accountId: "source-checking",
        date: "2026-01-01",
        amount: -10,
        categoryId: "source-groceries",
        payeeId: "source-shop",
        source: "Imported",
        importedPayee: "  LOCAL SHOP 0421 MELBOURNE  ",
        memo: "Card ending 4242",
        flag: "Red",
        cleared: "Cleared",
      },
      {
        entityId: "txn-2",
        accountId: "source-checking",
        date: "2026-01-02",
        amountMilliUnits: 25050,
        categoryId: "Category/__ImmediateIncome__",
      },
    ],
  });

  const register = registers.checking;
  assert.equal(register.transactions.length, 2);
  assert.equal(register.workingBalance, 15.05);
  assert.equal(register.clearedBalance, -10);
  assert.equal(register.unclearedBalance, 25.05);

  const expense = register.transactions.find((row) => row.id === "txn-1");
  assert.equal(expense?.payee, "Local Shop");
  assert.equal(expense?.rawPayee, "LOCAL SHOP 0421 MELBOURNE");
  assert.equal(expense?.category, "Groceries");
  assert.equal(expense?.memo, "Card ending 4242");
  assert.equal(expense?.date, "2026-01-01");
  assert.equal(expense?.outflow, 10);
  assert.deepEqual(expense?.tagIds, ["red-flag"]);

  const income = register.transactions.find((row) => row.id === "txn-2");
  assert.equal(income?.category, "Income for January 2026");
  assert.equal(income?.categoryId, undefined);
  assert.equal(income?.incomeBudgetMonth, "2026-01");
  assert.equal(income?.inflowClassification, "income");
  assert.equal(income?.inflow, 25.05);
});

test("migrates YNAB4 deferred income to the following budget month without changing its date", () => {
  const registers = mapYnab4Transactions({
    accounts,
    maps,
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map(),
    transactions: [{
      entityId: "deferred-income",
      accountId: "source-checking",
      date: "2026-01-31",
      amount: 125,
      categoryId: "Category/__DeferredIncome__",
    }],
  });

  const transaction = registers.checking.transactions[0];
  assert.equal(transaction?.date, "2026-01-31");
  assert.equal(transaction?.category, "Income for February 2026");
  assert.equal(transaction?.categoryId, undefined);
  assert.equal(transaction?.incomeBudgetMonth, "2026-02");
  assert.equal(transaction?.inflowClassification, "income");
  assert.equal(transaction?.inflow, 125);
});

test("migrates split income directly to canonical current and following months", () => {
  const registers = mapYnab4Transactions({
    accounts,
    maps,
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map(),
    transactions: [{
      entityId: "split-deferred-income",
      accountId: "source-checking",
      date: "2026-12-20",
      amount: 300,
      categoryId: "Category/__Split__",
      subTransactions: [
        {
          entityId: "deferred-line",
          amount: 200,
          categoryId: "Category/__DeferredIncome__",
        },
        {
          entityId: "immediate-line",
          amount: 100,
          categoryId: "Category/__ImmediateIncome__",
        },
      ],
    }],
  });

  const transaction = registers.checking.transactions[0];
  const deferred = transaction?.splitLines?.find(({ id }) => id === "deferred-line");
  const immediate = transaction?.splitLines?.find(({ id }) => id === "immediate-line");
  assert.equal(transaction?.date, "2026-12-20");
  assert.equal(deferred?.category, "Income for January 2027");
  assert.equal(deferred?.categoryId, undefined);
  assert.equal(deferred?.incomeBudgetMonth, "2027-01");
  assert.equal(deferred?.inflowClassification, "income");
  assert.equal(immediate?.category, "Income for December 2026");
  assert.equal(immediate?.categoryId, undefined);
  assert.equal(immediate?.incomeBudgetMonth, "2026-12");
  assert.equal(immediate?.inflowClassification, "income");
});

test("preserves cleared, reconciled, and uncleared state independently of accepted", () => {
  const sourceStates = [
    { id: "cleared", cleared: "Cleared", accepted: true, expectedCleared: true, expectedReconciled: false },
    { id: "reconciled", cleared: "Reconciled", accepted: true, expectedCleared: true, expectedReconciled: true },
    { id: "uncleared", cleared: "Uncleared", accepted: true, expectedCleared: false, expectedReconciled: false },
    { id: "accepted-only", accepted: true, expectedCleared: false, expectedReconciled: false },
    { id: "boolean-false", cleared: false, accepted: true, expectedCleared: false, expectedReconciled: false },
    { id: "lowercase", cleared: "cleared", expectedCleared: true, expectedReconciled: false },
    { id: "uppercase", cleared: "CLEARED", expectedCleared: true, expectedReconciled: false },
    { id: "uppercase-uncleared", cleared: "UNCLEARED", expectedCleared: false, expectedReconciled: false },
  ];
  const registers = mapYnab4Transactions({
    accounts,
    maps,
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map(),
    transactions: sourceStates.map((state, index) => ({
      entityId: state.id,
      accountId: "source-checking",
      date: `2026-01-${String(index + 1).padStart(2, "0")}`,
      amount: 1,
      ...state,
    })),
  });

  for (const state of sourceStates) {
    const transaction = registers.checking.transactions.find((row) => row.id === state.id);
    assert.equal(transaction?.cleared, state.expectedCleared, state.id);
    assert.equal(transaction?.reconciled, state.expectedReconciled, state.id);
  }
});

test("calculates mixed register balances from cleared state", () => {
  const registers = mapYnab4Transactions({
    accounts,
    maps,
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map(),
    transactions: [
      { entityId: "cleared-inflow", accountId: "source-checking", date: "2026-01-01", amount: 100, cleared: "Cleared" },
      { entityId: "accepted-uncleared-outflow", accountId: "source-checking", date: "2026-01-02", amount: -25, cleared: "Uncleared", accepted: true },
      { entityId: "reconciled-inflow", accountId: "source-checking", date: "2026-01-03", amount: 10, cleared: "Reconciled" },
    ],
  });

  assert.equal(registers.checking.clearedBalance, 110);
  assert.equal(registers.checking.unclearedBalance, -25);
  assert.equal(registers.checking.workingBalance, 85);
});

test("maps splits and reciprocal transfer metadata while ignoring tombstones", () => {
  const registers = mapYnab4Transactions({
    accounts,
    maps,
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map(),
    transactions: [
      {
        entityId: "split-parent",
        accountId: "source-checking",
        date: "2026-02-01",
        amount: -15,
        categoryId: "Category/__Split__",
        subTransactions: [
          {
            entityId: "split-active",
            amount: -15,
            categoryId: "source-groceries",
          },
          {
            entityId: "split-deleted",
            amount: -99,
            categoryId: "source-groceries",
            isTombstone: true,
          },
        ],
      },
      {
        entityId: "transfer-a",
        accountId: "source-checking",
        targetAccountId: "source-savings",
        transferTransactionId: "transfer-b",
        date: "2026-02-02",
        amount: -20,
      },
      {
        entityId: "deleted-parent",
        accountId: "source-checking",
        date: "2026-02-03",
        amount: -100,
        deleted: true,
      },
    ],
  });

  const register = registers.checking;
  assert.equal(register.transactions.length, 2);

  const split = register.transactions.find((row) => row.id === "split-parent");
  assert.equal(split?.category, "Split");
  assert.equal(split?.splitLines?.length, 1);
  assert.equal(split?.splitLines?.[0]?.category, "Groceries");

  const transfer = register.transactions.find((row) => row.id === "transfer-a");
  assert.equal(transfer?.payee, "Transfer: Savings");
  assert.equal(transfer?.category, "Transfer");
  assert.equal(transfer?.transferAccountId, "savings");
  assert.equal(transfer?.transferId, "ynab4-transfer-transfer-a--transfer-b");
});

test("maps split transfer metadata without assigning budget activity", () => {
  const registers = mapYnab4Transactions({
    accounts,
    maps,
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map(),
    transactions: [
      {
        entityId: "split-parent-transfer",
        accountId: "source-checking",
        date: "2026-02-04",
        amount: -30,
        categoryId: "Category/__Split__",
        subTransactions: [
          {
            entityId: "split-transfer-line",
            amount: -20,
            targetAccountId: "source-savings",
            transferTransactionId: "destination-transfer",
          },
          {
            entityId: "split-category-line",
            amount: -10,
            categoryId: "source-groceries",
          },
        ],
      },
      {
        entityId: "destination-transfer",
        accountId: "source-savings",
        date: "2026-02-04",
        amount: 20,
        targetAccountId: "source-checking",
        transferTransactionId: "split-transfer-line",
      },
    ],
  });

  const parent = registers.checking.transactions.find(
    (row) => row.id === "split-parent-transfer",
  );
  const transferLine = parent?.splitLines?.find(
    (line) => line.id === "split-transfer-line",
  );
  assert.equal(transferLine?.category, "Transfer");
  assert.equal(transferLine?.categoryId, undefined);
  assert.equal(transferLine?.transferAccountId, "savings");
  assert.equal(transferLine?.transferTransactionId, "destination-transfer");
  assert.equal(
    transferLine?.transferId,
    "ynab4-transfer-destination-transfer--split-transfer-line",
  );

  const categoryLine = parent?.splitLines?.find(
    (line) => line.id === "split-category-line",
  );
  assert.equal(categoryLine?.categoryId, "groceries");
});

test("rejects active transactions with unresolved accounts or categories", () => {
  assert.throws(
    () =>
      mapYnab4Transactions({
        accounts,
        maps,
        currencyCode: "AUD",
        importedFlagTagIdByColour: new Map(),
        transactions: [
          {
            entityId: "missing-account",
            accountId: "source-missing",
            date: "2026-03-01",
            amount: -1,
            categoryId: "source-groceries",
          },
        ],
      }),
    /Unresolved YNAB4 account "source-missing"/,
  );

  assert.throws(
    () =>
      mapYnab4Transactions({
        accounts,
        maps,
        currencyCode: "AUD",
        importedFlagTagIdByColour: new Map(),
        transactions: [
          {
            entityId: "missing-category",
            accountId: "source-checking",
            date: "2026-03-01",
            amount: -1,
            categoryId: "source-missing-category",
          },
        ],
      }),
    /Unresolved YNAB4 category "source-missing-category"/,
  );
});

test("rejects missing dates and amounts instead of fabricating defaults", () => {
  assert.throws(
    () =>
      mapYnab4Transactions({
        accounts,
        maps,
        currencyCode: "AUD",
        importedFlagTagIdByColour: new Map(),
        transactions: [
          {
            entityId: "missing-date",
            accountId: "source-checking",
            amount: -1,
            categoryId: "source-groceries",
          },
        ],
      }),
    /Invalid or missing YNAB4 date/,
  );

  assert.throws(
    () =>
      mapYnab4Transactions({
        accounts,
        maps,
        currencyCode: "AUD",
        importedFlagTagIdByColour: new Map(),
        transactions: [
          {
            entityId: "missing-amount",
            accountId: "source-checking",
            date: "2026-03-01",
            categoryId: "source-groceries",
          },
        ],
      }),
    /Invalid or missing YNAB4 amount/,
  );
});


test("imports known deleted-category references as uncategorised, never Ready to Assign", () => {
  const warnings: string[] = [];
  const deletedCategoryMaps = {
    ...maps,
    nonImportableCategorySourceIds: new Set(["source-deleted-category"]),
    warnings,
  };
  const registers = mapYnab4Transactions({
    accounts,
    maps: deletedCategoryMaps,
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map(),
    transactions: [
      {
        entityId: "deleted-category-expense",
        accountId: "source-checking",
        date: "2026-04-01",
        amount: -12,
        categoryId: "source-deleted-category",
      },
      {
        entityId: "deleted-category-split",
        accountId: "source-checking",
        date: "2026-04-02",
        amount: -8,
        categoryId: "Category/__Split__",
        subTransactions: [
          {
            entityId: "deleted-category-split-line",
            amount: -8,
            categoryId: "source-deleted-category",
          },
        ],
      },
    ],
  });

  const expense = registers.checking.transactions.find(
    row => row.id === "deleted-category-expense",
  );
  assert.equal(expense?.category, "Uncategorised");
  assert.equal(expense?.categoryId, undefined);

  const split = registers.checking.transactions.find(
    row => row.id === "deleted-category-split",
  );
  assert.equal(split?.splitLines?.[0]?.category, "Uncategorised");
  assert.equal(split?.splitLines?.[0]?.categoryId, undefined);
  assert.equal(
    warnings.some(warning => warning.includes("source-deleted-category")),
    true,
  );
});

test("recognises isDeleted as a YNAB4 tombstone flag", () => {
  const registers = mapYnab4Transactions({
    accounts,
    maps,
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map(),
    transactions: [
      {
        entityId: "is-deleted-transaction",
        accountId: "source-checking",
        date: "2026-05-01",
        amount: -99,
        categoryId: "source-groceries",
        isDeleted: true,
      },
    ],
  });
  assert.equal(registers.checking.transactions.length, 0);
});


test("does not invent raw payee provenance from absent or blank importedPayee", () => {
  const registers = mapYnab4Transactions({
    accounts,
    maps,
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map(),
    transactions: [
      {
        entityId: "no-imported-payee",
        accountId: "source-checking",
        date: "2026-06-01",
        amount: -1,
        payeeId: "source-shop",
      },
      {
        entityId: "blank-imported-payee",
        accountId: "source-checking",
        date: "2026-06-02",
        amount: -2,
        payeeId: "source-shop",
        importedPayee: "   ",
      },
    ],
  });

  assert.equal(registers.checking.transactions[0]?.rawPayee, undefined);
  assert.equal(registers.checking.transactions[1]?.rawPayee, undefined);
  assert.equal(registers.checking.transactions[0]?.payee, "Local Shop");
  assert.equal(registers.checking.transactions[1]?.payee, "Local Shop");
});
