import assert from "node:assert/strict";
import type {
  ImportSession,
  ImportSourceReader,
} from "../packages/ynab4-importer/src/source/index.js";

type ArchiveSummary = {
  format: "synthetic-relational";
  tables: readonly string[];
};
type ArchiveReferences = {
  currencies: readonly { code: string; decimals: number }[];
};
type ArchiveRow = {
  table: string;
  primaryKey: Uint8Array;
  columns: ReadonlyMap<string, unknown>;
};

class SyntheticRelationalReader
  implements ImportSourceReader<ArchiveSummary, ArchiveReferences, ArchiveRow>
{
  async inspect(): Promise<ArchiveSummary> {
    return { format: "synthetic-relational", tables: ["ledger"] };
  }

  async readReferenceData(): Promise<ArchiveReferences> {
    return { currencies: [{ code: "AUD", decimals: 2 }] };
  }

  async *streamRecords(): AsyncIterable<readonly ArchiveRow[]> {
    yield [{
      table: "ledger",
      primaryKey: new Uint8Array([1, 2, 3]),
      columns: new Map([["amount", 1250]]),
    }];
  }

  async close(): Promise<void> {}
}

type Persisted = { count: number };
type Result = { committed: boolean };

const sessionContract: ImportSession<
  ArchiveSummary,
  ArchiveReferences,
  ArchiveRow,
  Persisted,
  Result
> = {
  async validateSource(summary, references) {
    return {
      valid: summary.tables.length > 0 && references.currencies.length > 0,
      issues: [],
    };
  },
  async begin() {},
  async persistBatch(rows) {
    return { count: rows.length };
  },
  async commit() {
    return { committed: true };
  },
  async rollback() {},
  async close() {},
};

const reader: ImportSourceReader<ArchiveSummary, ArchiveReferences, ArchiveRow> =
  new SyntheticRelationalReader();
const summary = await reader.inspect();
const references = await reader.readReferenceData();
const validation = await sessionContract.validateSource(summary, references);
assert.equal(validation.valid, true);
for await (const batch of reader.streamRecords({ batchSize: 10 })) {
  assert.equal(batch[0]?.table, "ledger");
  assert.deepEqual(await sessionContract.persistBatch(batch), { count: 1 });
}
assert.deepEqual(await sessionContract.commit(), { committed: true });
await reader.close();

// This file is both a runtime smoke test and a compile-time proof: none of the
// synthetic relational types extends or mentions a YNAB4 record type.
console.log("Format-neutral import source and session contract tests passed");
