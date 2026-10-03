import assert from "node:assert/strict";
import test from "node:test";

import {
  mapActualSQLiteRepositoryToFullBudgetPreview,
} from "../../../packages/application/src/actualBudget/ActualBudgetMapper.js";
import type {
  ActualSQLiteRepository,
  ActualSQLiteTableRow,
} from "../../../packages/application/src/actualBudget/ActualSQLiteRepository.js";

function row(values: ActualSQLiteTableRow["values"]): ActualSQLiteTableRow {
  return { rowId: null, values };
}

function repository(
  tables: Record<string, ActualSQLiteTableRow[]>,
): ActualSQLiteRepository {
  return {
    readTableRows(tableName: string) {
      const rows = tables[tableName] ?? [];
      return {
        tableName,
        columns: rows.length > 0 ? Object.keys(rows[0]!.values) : [],
        rows,
        issues: [],
      };
    },
  } as unknown as ActualSQLiteRepository;
}

function baseTables(): Record<string, ActualSQLiteTableRow[]> {
  return {
    accounts: [],
    category_groups: [
      row({ id: "group-living", name: "Living", hidden: 0, is_income: 0 }),
    ],
    categories: [
      row({
        id: "category-groceries",
        name: "Groceries",
        cat_group: "group-living",
        hidden: 0,
        is_income: 0,
      }),
      row({
        id: "category-fuel",
        name: "Fuel",
        cat_group: "group-living",
        hidden: 0,
        is_income: 0,
      }),
    ],
    payees: [
      row({ id: "payee-coles", name: "Coles", tombstone: 0 }),
    ],
    transactions: [],
    zero_budgets: [],
    rules: [],
    notes: [],
  };
}

test("Actual simple payee-category rules become payee default categories and category notes are retained", () => {
  const tables = baseTables();
  tables.rules = [
    row({
      id: "rule-1",
      stage: null,
      conditions: JSON.stringify([
        { op: "is", field: "description", value: "payee-coles", type: "id" },
      ]),
      actions: JSON.stringify([
        { op: "set", field: "category", value: "category-groceries", type: "id" },
      ]),
      tombstone: 0,
      conditions_op: "and",
    }),
    row({
      id: "rule-2",
      stage: null,
      conditions: JSON.stringify([
        { op: "is", field: "description", value: "payee-coles", type: "id" },
      ]),
      actions: JSON.stringify([
        { op: "set", field: "category", value: "category-groceries", type: "id" },
      ]),
      tombstone: 0,
      conditions_op: "and",
    }),
  ];
  tables.notes = [
    row({ id: "category-groceries", note: "Keep this category note" }),
  ];

  const mapped = mapActualSQLiteRepositoryToFullBudgetPreview(repository(tables));

  const coles = mapped.payees.find(({ id }) => id === "payee-coles");
  assert.ok(coles);
  assert.equal(coles.defaultCategoryId, "category-groceries");
  assert.equal(coles.defaultCategoryName, "Groceries");

  const groceries = mapped.categories.find(({ id }) => id === "category-groceries");
  assert.ok(groceries);
  assert.equal(groceries.note, "Keep this category note");

  assert.equal(mapped.importedRuleCount, 2);
  assert.equal(mapped.unsupportedRuleCount, 0);
  assert.equal(mapped.ignoredDeletedRuleCount, 0);
  assert.equal(mapped.importedCategoryNoteCount, 1);
  assert.equal(mapped.unsupportedNoteCount, 0);
});

test("Actual complex or conflicting rules remain explicitly unsupported instead of being flattened", () => {
  const tables = baseTables();
  tables.rules = [
    row({
      id: "complex-rule",
      stage: null,
      conditions: JSON.stringify([
        { op: "is", field: "description", value: "payee-coles", type: "id" },
        { op: "is", field: "account", value: "account-1", type: "id" },
      ]),
      actions: JSON.stringify([
        { op: "set", field: "category", value: "category-groceries", type: "id" },
      ]),
      tombstone: 0,
      conditions_op: "and",
    }),
    row({
      id: "conflict-1",
      stage: null,
      conditions: JSON.stringify([
        { op: "is", field: "description", value: "payee-coles", type: "id" },
      ]),
      actions: JSON.stringify([
        { op: "set", field: "category", value: "category-groceries", type: "id" },
      ]),
      tombstone: 0,
      conditions_op: "and",
    }),
    row({
      id: "conflict-2",
      stage: null,
      conditions: JSON.stringify([
        { op: "is", field: "description", value: "payee-coles", type: "id" },
      ]),
      actions: JSON.stringify([
        { op: "set", field: "category", value: "category-fuel", type: "id" },
      ]),
      tombstone: 0,
      conditions_op: "and",
    }),
  ];

  const mapped = mapActualSQLiteRepositoryToFullBudgetPreview(repository(tables));

  const coles = mapped.payees.find(({ id }) => id === "payee-coles");
  assert.ok(coles);
  assert.equal(coles.defaultCategoryId, null);
  assert.equal(mapped.importedRuleCount, 0);
  assert.equal(mapped.unsupportedRuleCount, 3);
  assert.ok(mapped.issues.some(({ code }) => code === "ActualConflictingPayeeCategoryRules"));
});


test("Actual transaction categories are resolved through category_mapping before preview mapping", () => {
  const tables = baseTables();
  tables.accounts = [
    row({
      id: "account-checking",
      name: "Checking",
      type: "checking",
      offbudget: 0,
      closed: 0,
    }),
  ];
  tables.category_mapping = [
    row({
      id: "stored-category-id",
      transferId: "category-groceries",
    }),
  ];
  tables.transactions = [
    row({
      id: "transaction-1",
      acct: "account-checking",
      category: "stored-category-id",
      amount: -5_000,
      description: null,
      notes: null,
      date: 20261001,
      cleared: 1,
      isParent: 0,
      isChild: 0,
    }),
  ];

  const mapped = mapActualSQLiteRepositoryToFullBudgetPreview(repository(tables));
  const transaction = mapped.transactions.find(({ id }) => id === "transaction-1");

  assert.ok(transaction);
  assert.equal(transaction.categoryId, "category-groceries");
  assert.equal(transaction.categoryName, "Groceries");
  assert.equal(
    mapped.issues.some(({ code }) => code === "ActualUnknownCategoryReference"),
    false,
  );
});
