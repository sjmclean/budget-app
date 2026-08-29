import assert from "node:assert/strict";
import test from "node:test";
import type { PayeeView } from "../../../apps/web/src/features/accounts/payeeService.js";
import { resolveRegisterPayee } from "../../../apps/web/src/features/accounts/registerMerchantIcons.js";

const payee: PayeeView = {
  id: "payee-aldi",
  name: "ALDI",
  createdAt: "2026-08-29T00:00:00.000Z",
  lastUsedAt: "2026-08-29T00:00:00.000Z",
  useCount: 1,
  iconRef: "builtin:v1:groceries",
};
const payeesById = new Map([[payee.id, payee]]);

test("register merchant icon lookup uses only canonical payee identity", () => {
  assert.equal(resolveRegisterPayee(payeesById, { payee: "ALDI", payeeId: payee.id }), payee);
  assert.equal(resolveRegisterPayee(payeesById, { payee: "ALDI" }), undefined);
  assert.equal(resolveRegisterPayee(payeesById, { payee: "ALDI", payeeId: "missing" }), undefined);
  assert.equal(resolveRegisterPayee(payeesById, { payee: "", payeeId: payee.id }), undefined);
});

test("transfers never resolve a merchant icon", () => {
  assert.equal(resolveRegisterPayee(payeesById, {
    payee: "Transfer: Savings", payeeId: payee.id, transferId: "transfer-1",
  }), undefined);
  assert.equal(resolveRegisterPayee(payeesById, {
    payee: "Transfer: Savings", payeeId: payee.id, transferAccountId: "account-savings",
  }), undefined);
});
