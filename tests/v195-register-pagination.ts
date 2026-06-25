import assert from "node:assert/strict";

import {
  REGISTER_DEFAULT_PAGE_SIZE,
  getRegisterPaginationState,
  paginateRegisterItems,
} from "../apps/web/src/features/accounts/registerPagination.ts";

const transactionIds = Array.from({ length: 251 }, (_, index) => `transaction-${index + 1}`);

assert.equal(REGISTER_DEFAULT_PAGE_SIZE, 100);

const firstPage = getRegisterPaginationState(transactionIds.length, 1);
assert.equal(firstPage.totalItems, 251);
assert.equal(firstPage.totalPages, 3);
assert.equal(firstPage.currentPage, 1);
assert.equal(firstPage.visibleStart, 1);
assert.equal(firstPage.visibleEnd, 100);
assert.equal(firstPage.hasPreviousPage, false);
assert.equal(firstPage.hasNextPage, true);
assert.deepEqual(paginateRegisterItems(transactionIds, 1), transactionIds.slice(0, 100));

const secondPage = getRegisterPaginationState(transactionIds.length, 2);
assert.equal(secondPage.currentPage, 2);
assert.equal(secondPage.visibleStart, 101);
assert.equal(secondPage.visibleEnd, 200);
assert.equal(secondPage.hasPreviousPage, true);
assert.equal(secondPage.hasNextPage, true);
assert.deepEqual(paginateRegisterItems(transactionIds, 2), transactionIds.slice(100, 200));

const finalPage = getRegisterPaginationState(transactionIds.length, 3);
assert.equal(finalPage.currentPage, 3);
assert.equal(finalPage.visibleStart, 201);
assert.equal(finalPage.visibleEnd, 251);
assert.equal(finalPage.hasPreviousPage, true);
assert.equal(finalPage.hasNextPage, false);
assert.deepEqual(paginateRegisterItems(transactionIds, 3), transactionIds.slice(200, 251));

const clampedHighPage = getRegisterPaginationState(transactionIds.length, 99);
assert.equal(clampedHighPage.currentPage, 3);
assert.deepEqual(paginateRegisterItems(transactionIds, 99), transactionIds.slice(200, 251));

const clampedLowPage = getRegisterPaginationState(transactionIds.length, -10);
assert.equal(clampedLowPage.currentPage, 1);
assert.deepEqual(paginateRegisterItems(transactionIds, -10), transactionIds.slice(0, 100));

const emptyState = getRegisterPaginationState(0, 12);
assert.equal(emptyState.totalItems, 0);
assert.equal(emptyState.totalPages, 1);
assert.equal(emptyState.currentPage, 1);
assert.equal(emptyState.visibleStart, 0);
assert.equal(emptyState.visibleEnd, 0);
assert.equal(emptyState.hasPreviousPage, false);
assert.equal(emptyState.hasNextPage, false);
assert.deepEqual(paginateRegisterItems([], 12), []);

console.log("v1.95 register pagination tests passed");
