import assert from "node:assert/strict";
import { replicatePersistenceProvider } from "../apps/web/src/features/persistence/replicationEngine.js";
import { createOperationJournalEntry, type OperationJournalEntry } from "../apps/web/src/features/persistence/operationJournal.js";
import type { RemoteOperationEnvelope, ReplicationCursorState, ReplicationTransport } from "../apps/web/src/features/persistence/replication.js";

type Fault = "push-before" | "push-after" | "partial-ack" | "pull-before" | "duplicate-pull";

class ChaosServer {
  readonly generationId = "chaos-generation";
  readonly operations: RemoteOperationEnvelope[] = [];
  readonly operationIds = new Set<string>();
  readonly faults: Fault[];

  constructor(faults: Fault[]) { this.faults = [...faults]; }
  take(fault: Fault): boolean {
    const index = this.faults.indexOf(fault);
    if (index < 0) return false;
    this.faults.splice(index, 1);
    return true;
  }
  commit(entries: readonly OperationJournalEntry[]): number {
    let accepted = 0;
    for (const operation of entries) {
      if (this.operationIds.has(operation.operationId)) continue;
      this.operationIds.add(operation.operationId);
      this.operations.push({
        cursor: this.operations.length + 1,
        generationId: this.generationId,
        operation,
        receivedAt: new Date(0).toISOString(),
      });
      accepted += 1;
    }
    return accepted;
  }
  transport(): ReplicationTransport {
    return {
      getGeneration: async () => ({ protocolVersion: 2, generationId: this.generationId, latestCursor: this.operations.length, latestCheckpointId: null }),
      pushOperations: async (_generationId, operations) => {
        if (this.take("push-before")) throw new Error("simulated disconnect before push commit");
        const acceptedCount = this.commit(operations);
        if (this.take("push-after")) throw new Error("simulated disconnect after push commit");
        if (this.take("partial-ack")) return { generationId: this.generationId, acceptedCount, acknowledgedCount: Math.max(0, operations.length - 1), latestCursor: this.operations.length };
        return { generationId: this.generationId, acceptedCount, acknowledgedCount: operations.length, latestCursor: this.operations.length };
      },
      pullOperations: async (_generationId, afterCursor, limit = 500) => {
        if (this.take("pull-before")) throw new Error("simulated pull disconnect");
        let operations = this.operations.slice(afterCursor, afterCursor + limit);
        if (operations.length > 0 && this.take("duplicate-pull")) operations = [operations[0]!, ...operations];
        return { generationId: this.generationId, operations, latestCursor: this.operations.length, hasMore: afterCursor + limit < this.operations.length };
      },
      uploadCheckpoint: async () => { throw new Error("not used"); },
      getLatestCheckpoint: async () => null,
      hasBlob: async () => true,
      uploadBlob: async () => undefined,
      downloadBlob: async () => null,
    };
  }
}

class ChaosClient {
  readonly values = new Map<string, string>();
  readonly journal: OperationJournalEntry[] = [];
  readonly appliedRemoteIds = new Set<string>();
  cursor: ReplicationCursorState = { generationId: null, pushedLocalSequence: 0, pulledRemoteCursor: 0 };

  constructor(readonly id: string) {}
  write(key: string, value: string): void {
    const sequence = this.journal.length + 1;
    const operation = createOperationJournalEntry({ deviceId: this.id, sequence, operationId: `${this.id}-${sequence}`, now: new Date(sequence * 1000), mutation: { type: "key-value.set", key, value } });
    this.journal.push(operation);
    this.values.set(key, value);
  }
  provider(): any {
    return {
      operationJournal: {
        getJournalCursor: () => ({ deviceId: this.id, latestSequence: this.journal.length }),
        readJournal: async (afterSequence = 0, limit = 500) => this.journal.filter((entry) => entry.sequence > afterSequence).slice(0, limit),
      },
      replicationStore: {
        getReplicationCursorState: async () => this.cursor,
        setReplicationCursorState: async (state: ReplicationCursorState) => { this.cursor = state; },
        applyRemoteOperations: async (envelopes: readonly RemoteOperationEnvelope[]) => {
          let applied = 0;
          for (const envelope of envelopes) {
            if (this.appliedRemoteIds.has(envelope.operation.operationId)) continue;
            this.appliedRemoteIds.add(envelope.operation.operationId);
            const mutation = envelope.operation.mutation;
            if (mutation.type === "key-value.set") this.values.set(mutation.key, mutation.value);
            else this.values.delete(mutation.key);
            applied += 1;
          }
          return applied;
        },
        getReplicationDiagnostics: async () => ({ deviceId: this.id, latestLocalSequence: this.journal.length, retainedJournalEntryCount: this.journal.length, oldestRetainedSequence: this.journal[0]?.sequence ?? null, latestCheckpointId: null, checkpointCount: 0, generationId: this.cursor.generationId, pushedLocalSequence: this.cursor.pushedLocalSequence, pulledRemoteCursor: this.cursor.pulledRemoteCursor, unresolvedConflictCount: 0 }),
        pruneJournal: async () => 0,
        listConflicts: async () => [],
        resolveConflict: async () => undefined,
      },
      flush: async () => undefined,
    };
  }
}

async function main(): Promise<void> {
const server = new ChaosServer(["push-before", "push-after", "partial-ack", "pull-before", "duplicate-pull", "pull-before", "duplicate-pull"]);
const clients = [new ChaosClient("device-a"), new ChaosClient("device-b"), new ChaosClient("device-c")];
clients[0]!.write("account/name", "Everyday");
clients[0]!.write("account/note", "Primary account");
clients[1]!.write("category/name", "Groceries");
clients[1]!.write("account/name", "Daily spending");
clients[2]!.write("payee/name", "Local Market");
clients[2]!.write("category/name", "Food and groceries");

let observedFailures = 0;
for (let round = 0; round < 30; round += 1) {
  for (const client of clients) {
    try {
      await replicatePersistenceProvider(client.provider(), server.transport(), { batchSize: 2 });
    } catch (error) {
      assert.match(String(error), /simulated|acknowledged/);
      observedFailures += 1;
    }
  }
  if (server.faults.length === 0 && clients.every((client) => client.cursor.pushedLocalSequence === client.journal.length && client.cursor.pulledRemoteCursor === server.operations.length)) break;
}

assert.ok(observedFailures >= 4, "fault injection must interrupt multiple replication attempts");
assert.equal(server.faults.length, 0, "all deterministic faults must be exercised");
assert.equal(server.operations.length, 6, "post-commit retries must be deduplicated by operation ID");
assert.equal(server.operationIds.size, 6);

for (const client of clients) {
  assert.equal(client.cursor.pushedLocalSequence, client.journal.length, `${client.id}: local cursor did not recover`);
  assert.equal(client.cursor.pulledRemoteCursor, server.operations.length, `${client.id}: remote cursor did not converge`);
  assert.equal(client.appliedRemoteIds.size, server.operations.length, `${client.id}: duplicate delivery escaped idempotency guard`);
}

const canonical = JSON.stringify([...clients[0]!.values].sort());
for (const client of clients.slice(1)) assert.equal(JSON.stringify([...client.values].sort()), canonical, `${client.id}: state diverged after faults stopped`);
assert.deepEqual([...clients[0]!.values.keys()].sort(), [
  "account/name",
  "account/note",
  "category/name",
  "payee/name",
], "all independently authored keys must survive the fault sequence");

console.log(`v523 chaos replication: pass (${observedFailures} injected failures, ${server.operations.length} converged operations)`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
