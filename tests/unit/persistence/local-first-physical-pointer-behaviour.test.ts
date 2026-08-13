import assert from "node:assert/strict";
import test from "node:test";

import { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient";

type WorkerResponse =
  | {
      requestId: string;
      ok: true;
      result: unknown;
    }
  | {
      requestId: string;
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

class FakeWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  readonly requests: Array<Record<string, unknown>> = [];

  constructor(
    private readonly handler: (
      request: Record<string, unknown>,
    ) => unknown | Promise<unknown>,
  ) {}

  postMessage(request: Record<string, unknown>): void {
    this.requests.push(request);

    void Promise.resolve()
      .then(() => this.handler(request))
      .then(
        (result) => {
          this.onmessage?.({
            data: {
              requestId: String(request.requestId),
              ok: true,
              result,
            },
          } as MessageEvent<WorkerResponse>);
        },
        (error: unknown) => {
          const typed = error as Error & { code?: string };
          this.onmessage?.({
            data: {
              requestId: String(request.requestId),
              ok: false,
              error: {
                code: typed.code ?? "TEST_ERROR",
                message: typed.message,
              },
            },
          } as MessageEvent<WorkerResponse>);
        },
      );
  }

  terminate(): void {}
}

function manifest(
  physicalFilename: string,
  budgetId = "budget-1",
) {
  return {
    budgetId,
    syncEpoch: "epoch-1",
    schemaVersion: 1,
    localRevision: 0,
    durable: true,
    physicalFilename,
    counts: {
      accounts: 0,
      transactions: 0,
      payees: 0,
      categories: 0,
      budgetMonths: 0,
      scheduledTransactions: 0,
      transactionTags: 0,
    },
  };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    value(key: string): string | null {
      return values.get(key) ?? null;
    },
  };
}

const pointerKey = "budget-app.local-first.database-file.budget-1";

test("a new client reopens the physical generation published by a previous client", async () => {
  const storage = memoryStorage();

  const firstWorker = new FakeWorker((request) => {
    if (request.type === "commitBaselineReplacement") {
      return manifest("/budget-physical-budget-1-generation-a.sqlite3");
    }
    throw new Error(`Unexpected request: ${String(request.type)}`);
  });

  const first = new LocalBudgetDatabaseClient(
    firstWorker as unknown as Worker,
    storage,
  );

  await first.commitBaselineReplacement();

  assert.equal(
    storage.value(pointerKey),
    "/budget-physical-budget-1-generation-a.sqlite3",
  );

  const secondWorker = new FakeWorker((request) => {
    if (request.type === "open") {
      return manifest(String(request.physicalFilename));
    }
    throw new Error(`Unexpected request: ${String(request.type)}`);
  });

  const second = new LocalBudgetDatabaseClient(
    secondWorker as unknown as Worker,
    storage,
  );

  await second.open({
    budgetId: "budget-1",
    syncEpoch: "epoch-1",
    deviceId: "device-1",
  });

  const openRequest = secondWorker.requests.find(
    (request) => request.type === "open",
  );

  assert.equal(
    openRequest?.physicalFilename,
    "/budget-physical-budget-1-generation-a.sqlite3",
  );
});

test("failed worker promotion leaves the old pointer authoritative", async () => {
  const storage = memoryStorage({
    [pointerKey]: "/budget-physical-budget-1-generation-a.sqlite3",
  });

  const worker = new FakeWorker((request) => {
    if (request.type === "commitBaselineReplacement") {
      throw Object.assign(new Error("candidate validation failed"), {
        code: "BASELINE_SCOPE_MISMATCH",
      });
    }
    throw new Error(`Unexpected request: ${String(request.type)}`);
  });

  const client = new LocalBudgetDatabaseClient(
    worker as unknown as Worker,
    storage,
  );

  await assert.rejects(
    client.commitBaselineReplacement(),
    /candidate validation failed/,
  );

  assert.equal(
    storage.value(pointerKey),
    "/budget-physical-budget-1-generation-a.sqlite3",
  );
});

test("failed pointer publication never changes the old authoritative pointer", async () => {
  const values = new Map<string, string>([
    [pointerKey, "/budget-physical-budget-1-generation-a.sqlite3"],
  ]);

  const storage = {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(): void {
      throw new Error("storage quota failure");
    },
    removeItem(key: string): void {
      values.delete(key);
    },
  };

  const worker = new FakeWorker((request) => {
    if (request.type === "commitBaselineReplacement") {
      return manifest("/budget-physical-budget-1-generation-b.sqlite3");
    }
    if (request.type === "close") return null;
    throw new Error(`Unexpected request: ${String(request.type)}`);
  });

  const client = new LocalBudgetDatabaseClient(
    worker as unknown as Worker,
    storage,
  );

  await assert.rejects(
    client.commitBaselineReplacement(),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "LOCAL_DATABASE_POINTER_WRITE_FAILED",
  );

  assert.equal(
    values.get(pointerKey),
    "/budget-physical-budget-1-generation-a.sqlite3",
  );

  assert.ok(
    worker.requests.some((request) => request.type === "close"),
    "the unpublishable candidate must be closed",
  );
});

test("no pointer preserves the legacy filename fallback", async () => {
  const storage = memoryStorage();

  const worker = new FakeWorker((request) => {
    if (request.type === "open") {
      assert.equal(request.physicalFilename, undefined);
      return manifest("/budget-budget-1.sqlite3");
    }
    throw new Error(`Unexpected request: ${String(request.type)}`);
  });

  const client = new LocalBudgetDatabaseClient(
    worker as unknown as Worker,
    storage,
  );

  await client.open({
    budgetId: "budget-1",
    syncEpoch: "epoch-1",
    deviceId: "device-1",
  });
});
