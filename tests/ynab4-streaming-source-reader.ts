import assert from "node:assert/strict";
import {
  createYnab4ReaderDiagnostics,
  createYnab4SourceReader,
  Ynab4SourceError,
  type Ynab4ChunkSource,
} from "../packages/ynab4-importer/src/source/index.js";

const fixture = {
  budgetVersion: 42,
  settings: { dateFormat: "DD/MM/YYYY", symbol: "$", enabled: true, nullable: null },
  accounts: [{ entityId: "a1", name: "Everyday 🦘", balance: 12.5 }],
  masterCategories: [{
    entityId: "g1",
    name: "Living",
    subCategories: [{ entityId: "c1", name: "Café", deleted: false }],
  }],
  payees: [{ entityId: "p1", name: 'The "Shop"' }],
  monthlyBudgets: [{ month: "2026-07", budgeted: -10 }],
  transactions: [
    { entityId: "t1", amount: -1, memo: "emoji 🧾 and escaped \"quote\"", cleared: true, value: null },
    { entityId: "t2", amount: 2.75, nested: { split: [{ amount: 1 }, { amount: 1.75 }] } },
    { entityId: "t3", amount: 1e3, memo: "line\nbreak" },
  ],
  scheduledTransactions: [{ entityId: "s1", frequency: "Monthly", amount: -5 }],
};
const sourceText = JSON.stringify(fixture);

for (const chunkSize of [1, 2, 3, 7, 16, 64, 1024]) {
  const reader = createYnab4SourceReader(sourceText, { chunkSize, sourceName: `fixture-${chunkSize}.yfull` });
  const small = await reader.readSmallCollections();
  assert.deepEqual(small.accounts, fixture.accounts);
  assert.deepEqual(small.masterCategories, fixture.masterCategories);
  assert.deepEqual(small.payees, fixture.payees);
  assert.deepEqual(small.monthlyBudgets, fixture.monthlyBudgets);
  assert.deepEqual(await collect(reader.streamTransactions({ batchSize: 2 })), fixture.transactions);
  assert.deepEqual(await collect(reader.streamScheduledTransactions({ batchSize: 1 })), fixture.scheduledTransactions);
  const metadata = await reader.getMetadata();
  assert.deepEqual(metadata.topLevelKeys, Object.keys(fixture));
  await reader.close();
}

// Every byte boundary is exercised by the one-byte run above, including UTF-8,
// escape, number, literal, nested-array and transaction boundaries.
for (const count of [0, 1, 3, 4, 5, 8, 9]) {
  const transactions = Array.from({ length: count }, (_, index) => ({ entityId: `t${index}` }));
  const reader = createYnab4SourceReader(JSON.stringify({ accounts: [], masterCategories: [], payees: [], monthlyBudgets: [], transactions, scheduledTransactions: [] }), { chunkSize: 7 });
  const batches: readonly Record<string, unknown>[][] = [];
  for await (const batch of reader.streamTransactions({ batchSize: 4 })) batches.push(batch);
  assert.deepEqual(batches.flat(), transactions);
  assert.equal(batches.length, Math.ceil(count / 4));
  assert.ok(batches.every((batch) => batch.length <= 4));
  for (let index = 1; index < batches.length; index += 1) assert.notEqual(batches[index], batches[index - 1]);
}

class BoundedBlob extends Blob {
  readonly slices: Array<[number, number]> = [];
  text(): Promise<string> {
    throw new Error("Blob.text() must never be called");
  }
  slice(start = 0, end = this.size, contentType?: string): Blob {
    this.slices.push([start, end]);
    assert.ok(end - start <= 17, `unbounded slice: ${end - start}`);
    assert.ok(!(start === 0 && end === this.size), "full source slice requested");
    return super.slice(start, end, contentType);
  }
}
const boundedBlob = new BoundedBlob([sourceText]);
const diagnostics = createYnab4ReaderDiagnostics();
const blobReader = createYnab4SourceReader(boundedBlob, { chunkSize: 17, diagnostics });
const blobBatches: readonly Record<string, unknown>[][] = [];
for await (const batch of blobReader.streamTransactions({ batchSize: 2 })) blobBatches.push(batch);
assert.deepEqual(blobBatches.flat(), fixture.transactions);
assert.ok(boundedBlob.slices.length > 1);
assert.ok(Math.max(...boundedBlob.slices.map(([start, end]) => end - start)) <= 17);
assert.equal(diagnostics.transactionsYielded, 3);
assert.equal(diagnostics.transactionBatchesYielded, 2);
assert.ok(diagnostics.maximumBufferedBytes < sourceText.length);

const cachedSmallBlob = new BoundedBlob([sourceText]);
const cachedSmallReader = createYnab4SourceReader(cachedSmallBlob, {
  chunkSize: 17,
});
await cachedSmallReader.getMetadata();
const readsAfterMetadata = cachedSmallBlob.slices.length;
await cachedSmallReader.readSmallCollections();
assert.equal(
  cachedSmallBlob.slices.length,
  readsAfterMetadata,
  "metadata and reference data should share one bounded source scan",
);
await cachedSmallReader.close();

// Cancellation before reading, during a chunk, after a batch, and while a
// multi-chunk string is being decoded.
const preAbort = new AbortController();
preAbort.abort();
await assert.rejects(
  async () => collect(createYnab4SourceReader(sourceText).streamTransactions({ signal: preAbort.signal })),
  (error: unknown) => isAbort(error),
);

const earlyAbort = new AbortController();
const earlySource: Ynab4ChunkSource = {
  size: null,
  async read() {
    earlyAbort.abort();
    return new TextEncoder().encode('{"transactions":[');
  },
};
await assert.rejects(
  async () => collect(createYnab4SourceReader(earlySource).streamTransactions({ signal: earlyAbort.signal })),
  (error: unknown) => isAbort(error),
);

const afterBatchAbort = new AbortController();
const afterBatchIterator = createYnab4SourceReader(sourceText, { chunkSize: 5 })
  .streamTransactions({ batchSize: 1, signal: afterBatchAbort.signal })[Symbol.asyncIterator]();
assert.equal((await afterBatchIterator.next()).value?.length, 1);
afterBatchAbort.abort();
await assert.rejects(() => afterBatchIterator.next(), (error: unknown) => isAbort(error));

const stringAbort = new AbortController();
let stringReads = 0;
const stringBytes = new TextEncoder().encode('{"transactions":[{"memo":"' + "x".repeat(100) + '"}],"scheduledTransactions":[]}');
const stringSource: Ynab4ChunkSource = {
  size: stringBytes.length,
  async read(offset, maximumBytes) {
    stringReads += 1;
    if (stringReads === 4) stringAbort.abort();
    return stringBytes.slice(offset, offset + maximumBytes);
  },
};
await assert.rejects(
  async () => collect(createYnab4SourceReader(stringSource, { chunkSize: 3 }).streamTransactions({ signal: stringAbort.signal })),
  (error: unknown) => isAbort(error),
);

for (const [bad, expectedKind] of [
  ['{"transactions":[{"id":"x"}]', "syntax"],
  ['{"transactions":[{"memo":"\\q"}],"scheduledTransactions":[]}', "syntax"],
  ['{"transactions":{},"scheduledTransactions":[]}', "schema"],
  ['[]', "syntax"],
  ['{"accounts":[],"transactions":[],"transactions":[],"scheduledTransactions":[]}', "schema"],
] as const) {
  await assert.rejects(
    async () => collect(createYnab4SourceReader(bad, { sourceName: "malformed.yfull", chunkSize: 2 }).streamTransactions()),
    (error: unknown) =>
      error instanceof Ynab4SourceError &&
      error.kind === expectedKind &&
      error.message.includes("malformed.yfull") &&
      !error.message.includes(bad),
  );
}

await assert.rejects(
  () => createYnab4SourceReader(JSON.stringify({ accounts: {}, masterCategories: [], payees: [], monthlyBudgets: [], transactions: [], scheduledTransactions: [] })).readSmallCollections(),
  (error: unknown) => error instanceof Ynab4SourceError && error.kind === "schema" && error.collection === "accounts",
);
await assert.rejects(
  async () => collect(createYnab4SourceReader('{"accounts":[]}').streamTransactions()),
  (error: unknown) => error instanceof Ynab4SourceError && error.kind === "schema",
);

const hostile = JSON.parse('{"transactions":[{"__proto__":{"polluted":true},"constructor":{"x":1},"prototype":{"x":2},"safe":1}],"scheduledTransactions":[]}') as Record<string, unknown>;
const hostileRows = await collect(createYnab4SourceReader(JSON.stringify(hostile)).streamTransactions());
assert.equal(({} as { polluted?: boolean }).polluted, undefined);
assert.equal(hostileRows[0]?.safe, 1);
assert.equal(Object.prototype.hasOwnProperty.call(hostileRows[0], "__proto__"), false);

async function collect(iterable: AsyncIterable<readonly Record<string, unknown>[]>): Promise<Record<string, unknown>[]> {
  const result: Record<string, unknown>[] = [];
  for await (const batch of iterable) result.push(...batch);
  return result;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

class LazyTransactionSource implements Ynab4ChunkSource {
  readonly size = null;
  private expectedOffset = 0;
  private transactionIndex = -1;
  private remainder = new Uint8Array();

  constructor(
    private readonly count: number,
    private readonly memo: string,
  ) {}

  async read(offset: number, maximumBytes: number): Promise<Uint8Array> {
    assert.equal(offset, this.expectedOffset, "reader must request sequential bounded chunks");
    while (this.remainder.byteLength < maximumBytes && this.transactionIndex <= this.count) {
      const next = new TextEncoder().encode(this.nextSegment());
      const joined = new Uint8Array(this.remainder.byteLength + next.byteLength);
      joined.set(this.remainder);
      joined.set(next, this.remainder.byteLength);
      this.remainder = joined;
    }
    const output = this.remainder.slice(0, maximumBytes);
    this.remainder = this.remainder.slice(output.byteLength);
    this.expectedOffset += output.byteLength;
    return output;
  }

  private nextSegment(): string {
    this.transactionIndex += 1;
    if (this.transactionIndex === 0) {
      return '{"accounts":[],"masterCategories":[],"payees":[],"monthlyBudgets":[],"transactions":[';
    }
    if (this.transactionIndex <= this.count) {
      const index = this.transactionIndex - 1;
      return `${index === 0 ? "" : ","}${JSON.stringify({ entityId: `synthetic-${index}`, amount: index + 0.25, memo: this.memo, split: [{ amount: -1 }] })}`;
    }
    if (this.transactionIndex === this.count + 1) return '],"scheduledTransactions":[]}';
    return "";
  }
}

// Structurally large input is exposed lazily: routine CI uses 2,000 rows;
// YNAB4_STREAMING_LARGE=1 uses 200,000 rows with long Unicode memos (roughly
// 300 MB) without constructing one giant fixture string.
const performanceMode = process.env.YNAB4_STREAMING_LARGE === "1";
const syntheticCount = performanceMode ? 200_000 : 2_000;
const syntheticMemo = performanceMode ? "長いメモ🧾".repeat(110) : "memo 🧾";
const syntheticReader = createYnab4SourceReader(
  new LazyTransactionSource(syntheticCount, syntheticMemo),
  { chunkSize: 4096 },
);
let syntheticSeen = 0;
for await (const batch of syntheticReader.streamTransactions({ batchSize: 257 })) {
  assert.ok(batch.length <= 257);
  for (const row of batch) {
    assert.equal(row.entityId, `synthetic-${syntheticSeen}`);
    syntheticSeen += 1;
  }
}
assert.equal(syntheticSeen, syntheticCount);

console.log(`YNAB4 streaming source reader tests passed: chunks=7, transactions=${diagnostics.transactionsYielded}, synthetic=${syntheticSeen}, maxBufferedBytes=${diagnostics.maximumBufferedBytes}`);
