import assert from "node:assert/strict";
import test from "node:test";

import { createPayeeCommands } from "../../../apps/web/src/features/persistence/localFirst/engine/payeeCommands.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import type { LocalPayeeRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

function harness(initial: LocalPayeeRecord[] = []) {
  const rows = new Map(initial.map((row) => [row.id, structuredClone(row)]));
  const committed: LocalBudgetMutation[] = [];
  const changes: string[][] = [];
  let sequence = 0;
  let failDelete = false;
  const database = {
    async listPayees(_budgetId: string, archived: boolean) { return [...rows.values()].filter((row) => row.archived === archived); },
    async writePayee(payee: LocalPayeeRecord, mutation: LocalBudgetMutation) { rows.set(payee.id, structuredClone(payee)); committed.push(mutation); },
    async deleteUnusedPayee(_budgetId: string, payeeId: string, mutation: LocalBudgetMutation) {
      if (failDelete) throw new Error("worker failed");
      rows.delete(payeeId); committed.push(mutation);
    },
    async mergePayees(input: { sourcePayeeId: string; mutation: LocalBudgetMutation }) {
      rows.delete(input.sourcePayeeId); committed.push(input.mutation);
    },
    async keepPayeesSeparate() {},
    async replacePayeeDuplicateSuppressionsHistoryState() {},
  } as unknown as LocalBudgetDatabaseClient;
  const commands = createPayeeCommands({
    async requireDatabase() { return database; },
    createMutation(budgetId, domain, entityId, operation, payload) {
      sequence += 1;
      return { mutationId: `m-${sequence}`, budgetId, syncEpoch: "epoch", deviceId: "device", deviceSequence: sequence,
        baseCursor: 0, domain, entityId, operation, payload, createdAt: "2026-01-01T00:00:00.000Z" };
    },
    recordCommittedChange(_budgetId, change) { changes.push([...change.domains]); },
  });
  return { commands, rows, committed, changes, setFailDelete(value: boolean) { failDelete = value; } };
}

const payee = (id: string, archived = false): LocalPayeeRecord => ({
  id, budgetId: "budget", name: id, note: "note", archived,
  aliases: [], importRules: [], iconRef: "", createdAt: "2026-01-01T00:00:00.000Z",
});

test("payee create/update/archive/delete preserve mutation and scope integrity", async () => {
  const h = harness();
  await h.commands.createPayee("budget", " New payee ", "new");
  assert.equal(h.rows.get("new")?.name, "New payee");
  assert.equal(h.committed[0]?.mutationId, "m-1");
  assert.deepEqual(h.changes[0], ["payees"]);

  await h.commands.updatePayee("budget", { id: "new", name: "Renamed" });
  assert.equal(h.rows.get("new")?.note, "");
  await assert.rejects(() => h.commands.updatePayee("budget", {
    id: "new", iconUpdate: { kind: "set", iconRef: "builtin:v1:unknown" },
  }));
  assert.equal(h.committed.length, 2);

  await h.commands.setPayeeArchived("budget", "new", true);
  assert.equal(h.rows.get("new")?.archived, true);
  await h.commands.setPayeeArchived("budget", "new", false);
  assert.equal(h.rows.get("new")?.archived, false);
  await h.commands.deleteUnusedPayee?.("budget", "new");
  assert.equal(h.rows.has("new"), false);
  assert.equal(h.committed.length, 5);
});

test("history conflict and worker failure record no committed change", async () => {
  const h = harness([payee("a")]);
  await assert.rejects(() => h.commands.replacePayeeHistoryState({
    budgetId: "budget", payeeId: "a", expected: null, replacement: null,
  }), /PAYEE_HISTORY_CONFLICT/);
  assert.equal(h.committed.length, 0);
  assert.equal(h.changes.length, 0);
  h.setFailDelete(true);
  await assert.rejects(() => h.commands.deleteUnusedPayee?.("budget", "a"), /worker failed/);
  assert.equal(h.committed.length, 0);
  assert.equal(h.changes.length, 0);
});

test("payee merge scopes only requested linked domains and commits one mutation", async () => {
  for (const [linked, scheduled, expected] of [
    [false, false, ["payees"]],
    [true, false, ["payees", "transactions"]],
    [false, true, ["payees", "scheduled-transactions"]],
    [true, true, ["payees", "transactions", "scheduled-transactions"]],
  ] as const) {
    const h = harness([payee("source"), payee("target")]);
    await h.commands.mergePayees("budget", {
      sourcePayeeId: "source", targetPayeeId: "target",
      updateLinkedTransactions: linked, updateScheduledTransactions: scheduled,
    });
    assert.equal(h.committed.length, 1);
    assert.equal(h.committed[0]?.mutationId, "m-1");
    assert.deepEqual(h.changes, [expected]);
  }
});

test("duplicate suppression commands commit payee scope without fabricating mutations", async () => {
  const h = harness();
  await h.commands.keepPayeesSeparate?.("budget", [{ leftPayeeId: "a", rightPayeeId: "b" }]);
  await h.commands.replacePayeeDuplicateSuppressionsHistoryState?.({
    budgetId: "budget", expected: [], replacement: [{ leftPayeeId: "a", rightPayeeId: "b" }],
  });
  assert.equal(h.committed.length, 0);
  assert.deepEqual(h.changes, [["payees"], ["payees"]]);
});
