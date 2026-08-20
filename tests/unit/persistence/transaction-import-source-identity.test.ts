import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTransactionImportSourceIdentities,
} from "../../../apps/web/src/features/accounts/transactionImportKnowledge.js";

function candidate(id: string, externalId: string) {
  return {
    id,
    parsed: {
      date: "2026-08-20",
      payee: "Merchant",
      inflow: 0,
      outflow: 25,
      raw: {
        date: "2026-08-20",
        amount: "-25.00",
        payee: "Merchant",
        transactionId: externalId,
      },
    },
  };
}

test("source identities preserve incoming-file occurrence order", () => {
  const first = candidate("candidate-1", "same-id");
  const second = candidate("candidate-2", "same-id");
  const third = candidate("candidate-3", "same-id");

  const sourceIdentities = buildTransactionImportSourceIdentities(
    "csv",
    [first, second, third],
  );

  assert.equal(sourceIdentities[first.id]?.occurrence, 1);
  assert.equal(sourceIdentities[second.id]?.occurrence, 2);
  assert.equal(sourceIdentities[third.id]?.occurrence, 3);

  assert.equal(
    sourceIdentities[first.id]?.identity,
    sourceIdentities[second.id]?.identity,
  );
  assert.equal(
    sourceIdentities[second.id]?.identity,
    sourceIdentities[third.id]?.identity,
  );
});

test("source identity occurrence counters are independent per identity", () => {
  const sourceIdentities = buildTransactionImportSourceIdentities(
    "csv",
    [
      candidate("a-1", "external-a"),
      candidate("b-1", "external-b"),
      candidate("a-2", "external-a"),
      candidate("b-2", "external-b"),
      candidate("a-3", "external-a"),
    ],
  );

  assert.equal(sourceIdentities["a-1"]?.occurrence, 1);
  assert.equal(sourceIdentities["a-2"]?.occurrence, 2);
  assert.equal(sourceIdentities["a-3"]?.occurrence, 3);

  assert.equal(sourceIdentities["b-1"]?.occurrence, 1);
  assert.equal(sourceIdentities["b-2"]?.occurrence, 2);
});

test("source identity metadata is keyed by candidate without changing candidate ids", () => {
  const sourceIdentities = buildTransactionImportSourceIdentities(
    "qif",
    [
      candidate("candidate-a", "external-a"),
      candidate("candidate-b", "external-b"),
    ],
  );

  assert.deepEqual(
    Object.keys(sourceIdentities).sort(),
    ["candidate-a", "candidate-b"],
  );

  assert.equal(sourceIdentities["candidate-a"]?.candidateId, "candidate-a");
  assert.equal(sourceIdentities["candidate-b"]?.candidateId, "candidate-b");
});
