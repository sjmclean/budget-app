import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REGISTER_SEARCH_SCOPE_LABELS,
  buildRegisterSearchSuggestions,
  transactionMatchesSearch,
} from "../apps/web/src/features/accounts/registerSearch";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";

const root = process.cwd();
const registerSearchSource = readFileSync(
  join(root, "apps/web/src/features/accounts/registerSearch.ts"),
  "utf8",
);
const registerPageSource = readFileSync(
  join(root, "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);

function createTransaction(
  input: Partial<RegisterTransactionView>,
): RegisterTransactionView {
  return {
    id: input.id ?? "tx-1",
    date: input.date ?? "2026-06-01",
    payee: input.payee ?? "Fresh Market",
    payeeId: input.payeeId,
    category: input.category ?? "Groceries",
    categoryId: input.categoryId,
    memo: input.memo ?? "Weekly shop",
    checkNumber: input.checkNumber,
    outflow: input.outflow ?? 42.5,
    inflow: input.inflow ?? 0,
    cleared: input.cleared ?? false,
    flag: input.flag,
    runningBalance: input.runningBalance ?? 0,
    attachmentCount: input.attachmentCount ?? 0,
    splitLines: input.splitLines,
  };
}

function testSearchMatchingIsExtracted() {
  const transactions = [
    createTransaction({
      id: "groceries",
      payee: "Fresh Market",
      category: "Groceries",
      outflow: 42.5,
    }),
    createTransaction({
      id: "salary",
      payee: "Employer",
      category: "Ready to Assign",
      memo: "July salary",
      outflow: 0,
      inflow: 2500,
    }),
    createTransaction({
      id: "split",
      payee: "Department Store",
      category: "Split",
      memo: "Receipt",
      outflow: 100,
      splitLines: [
        {
          id: "line-1",
          category: "Clothing",
          categoryId: "clothing",
          memo: "Jacket",
          outflow: 80,
          inflow: 0,
        },
        {
          id: "line-2",
          category: "Household",
          categoryId: "household",
          memo: "Towels",
          outflow: 20,
          inflow: 0,
        },
      ],
    }),
  ];

  assert.equal(
    transactionMatchesSearch(transactions[0], {
      query: "fresh",
      scope: "payee",
      label: "fresh",
    }),
    true,
  );
  assert.equal(
    transactionMatchesSearch(transactions[0], {
      query: "42.50",
      scope: "amount",
      label: "42.50",
    }),
    true,
  );
  assert.equal(
    transactionMatchesSearch(transactions[1], {
      query: "salary",
      scope: "memo",
      label: "salary",
    }),
    true,
  );
  assert.equal(
    transactionMatchesSearch(transactions[2], {
      query: "clothing",
      scope: "category",
      label: "clothing",
    }),
    true,
  );
  assert.equal(
    transactionMatchesSearch(transactions[2], {
      query: "jacket",
      scope: "all",
      label: "jacket",
    }),
    true,
  );
}

function testSearchSuggestionsAreExtracted() {
  const transactions = [
    createTransaction({
      id: "one",
      payee: "Fresh Market",
      category: "Groceries",
      memo: "fruit",
      outflow: 30,
    }),
    createTransaction({
      id: "two",
      payee: "Fresh Market",
      category: "Groceries",
      memo: "vegetables",
      outflow: 25,
    }),
    createTransaction({
      id: "three",
      payee: "Fuel Station",
      category: "Fuel",
      memo: "premium",
      outflow: 75,
    }),
  ];

  const suggestions = buildRegisterSearchSuggestions(transactions, "fresh");
  assert.equal(suggestions[0]?.id, "search:all");
  assert.ok(
    suggestions.some(
      (suggestion) =>
        suggestion.group === "payees" &&
        suggestion.label === "Fresh Market" &&
        suggestion.count === 2,
    ),
  );

  const amountSuggestions = buildRegisterSearchSuggestions(transactions, "75");
  assert.ok(
    amountSuggestions.some((suggestion) => suggestion.id === "search:amount"),
  );
}

function testReleaseWiring() {
  assert.match(
    registerSearchSource,
    /export function transactionMatchesSearch/,
  );
  assert.match(
    registerSearchSource,
    /export function buildRegisterSearchSuggestions/,
  );
  assert.match(
    registerSearchSource,
    /export const REGISTER_SEARCH_SCOPE_LABELS/,
  );

  assert.match(
    registerPageSource,
    /from "\.\.\/features\/accounts\/registerSearch"/,
  );
  assert.doesNotMatch(registerPageSource, /function transactionMatchesSearch/);
  assert.doesNotMatch(
    registerPageSource,
    /function buildRegisterSearchSuggestions/,
  );
  assert.equal(REGISTER_SEARCH_SCOPE_LABELS.all, "all fields");
}

function run() {
  testSearchMatchingIsExtracted();
  testSearchSuggestionsAreExtracted();
  testReleaseWiring();
  console.log("v2.52.1 register search extraction checks passed");
}

run();
