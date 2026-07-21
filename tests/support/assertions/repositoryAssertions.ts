import assert from "node:assert/strict";

export function assertPersistedEqual<T>(actual: T, expected: T, message = "persisted value"): void {
  assert.deepEqual(actual, expected, `Expected ${message} to round-trip without loss`);
}

export function assertNoDuplicateCreation(values: readonly { id: string }[]): void {
  assert.equal(new Set(values.map((value) => value.id)).size, values.length, "Expected every persisted id to be unique");
}

export function assertBudgetIsolation(
  values: readonly { budgetId: string }[],
  expectedBudgetId: string,
): void {
  assert.ok(values.every((value) => value.budgetId === expectedBudgetId), "Expected results to contain only the requested budget");
}

export function assertLinkedTransferIntegrity(
  source: { id: string; accountId: string; transferAccountId?: string | null; linkedTransactionId?: string | null; amount: number },
  destination: { id: string; accountId: string; transferAccountId?: string | null; linkedTransactionId?: string | null; amount: number },
): void {
  assert.equal(source.linkedTransactionId, destination.id, "Expected source to reference destination");
  assert.equal(destination.linkedTransactionId, source.id, "Expected destination to reference source");
  assert.equal(source.transferAccountId, destination.accountId, "Expected source to reference destination account");
  assert.equal(destination.transferAccountId, source.accountId, "Expected destination to reference source account");
  assert.equal(source.amount + destination.amount, 0, "Expected transfer pair to balance");
}

export function assertRollbackAtomic<T>(before: T, after: T): void {
  assert.deepEqual(after, before, "Expected failed operation to leave persisted state unchanged");
}

export function assertImportFingerprintPreserved(
  actual: { importSourceFingerprint?: string | null },
  expected: string,
): void {
  assert.equal(actual.importSourceFingerprint, expected, "Expected import source fingerprint to survive persistence");
}
