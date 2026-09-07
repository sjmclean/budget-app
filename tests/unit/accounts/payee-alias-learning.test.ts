import assert from "node:assert/strict";
import test from "node:test";
import type { PayeeView } from "../../../apps/web/src/features/accounts/payeeService";
import { appendCanonicalPayeeAlias } from "../../../apps/web/src/features/accounts/payeeAliasLearning";

function payee(overrides: Partial<PayeeView> = {}): PayeeView {
  return {
    id: "payee-1",
    name: "1st Internet",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-01-01T00:00:00.000Z",
    useCount: 1,
    ...overrides,
  };
}

test("confirmed raw description is appended as a canonical payee alias", () => {
  const aliases = appendCanonicalPayeeAlias({
    payee: payee(),
    rawPayee: "  TELECOM   BILLING SOUTH MELBOU AUS  ",
    aliasId: "alias-1",
  });

  assert.deepEqual(aliases, [
    { id: "alias-1", value: "TELECOM BILLING SOUTH MELBOU AUS" },
  ]);
});

test("canonical alias learning preserves existing aliases and deduplicates normalised identity", () => {
  const current = payee({
    aliases: [{ id: "existing", value: "Telecom Billing South-Melbou Aus" }],
  });

  assert.equal(
    appendCanonicalPayeeAlias({
      payee: current,
      rawPayee: "TELECOM BILLING SOUTH MELBOU AUS",
      aliasId: "alias-2",
    }),
    null,
  );
});

test("canonical name, blank source, and transfer targets are not learned as aliases", () => {
  assert.equal(
    appendCanonicalPayeeAlias({ payee: payee(), rawPayee: "1st Internet", aliasId: "a" }),
    null,
  );
  assert.equal(
    appendCanonicalPayeeAlias({ payee: payee(), rawPayee: "   ", aliasId: "b" }),
    null,
  );
  assert.equal(
    appendCanonicalPayeeAlias({
      payee: payee({ name: "Transfer: Savings" }),
      rawPayee: "BANK TRANSFER 123",
      aliasId: "c",
    }),
    null,
  );
});
