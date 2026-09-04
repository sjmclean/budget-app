import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { emptyDomainCounts } from "../../apps/web/src/features/persistence/localFirst/contracts";

export const GRANULARITY_CANDIDATES = [32, 64, 128, 256].map((kib) => kib * 1024);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Test-only locality diagnostics. Timings are CPU/Blob simulation, not OPFS/browser benchmarks. */
export async function compareGranularity(before: Uint8Array, after: Uint8Array) {
  const pageSize = before[16] === 0 && before[17] === 1 ? 65536 : before[16] * 256 + before[17];
  const changedPageRanges: [number, number][] = [];
  for (let offset = 0; offset < Math.max(before.length, after.length); offset += pageSize) {
    if (hash(before.subarray(offset, offset + pageSize)) === hash(after.subarray(offset, offset + pageSize))) continue;
    const page = offset / pageSize + 1;
    const previous = changedPageRanges.at(-1);
    if (previous && previous[1] === page - 1) previous[1] = page;
    else changedPageRanges.push([page, page]);
  }
  const rows = [];
  for (const chunkSize of GRANULARITY_CANDIDATES) {
    const files = new Map<string, File>();
    for (let offset = 0; offset < before.length; offset += chunkSize) {
      const content = before.subarray(offset, offset + chunkSize);
      const key = hash(content);
      files.set(key, new File([Uint8Array.from(content)], key));
    }
    const initialFiles = files.size;
    let newBytesStored = 0;
    let newChunkCount = 0;
    const chunks: { hash: string; length: number }[] = [];
    const start = performance.now();
    for (let offset = 0; offset < after.length; offset += chunkSize) {
      const content = after.subarray(offset, offset + chunkSize);
      const key = hash(content);
      if (!files.has(key)) {
        newBytesStored += content.length; newChunkCount++;
        files.set(key, new File([Uint8Array.from(content)], key));
      }
      chunks.push({ hash: key, length: content.length });
    }
    const hashAndChunkMs = performance.now() - start;
    const manifest = { schema: "sqlite-restore-point.v2", id: "fixture-point", budgetId: "fixture-budget",
      budgetName: "Granularity fixture", createdAt: "2026-09-04T00:00:00.000Z", reason: "timed",
      syncEpoch: "fixture-epoch", localRevision: 2, mutationCount: 1, totalBytes: after.length,
      databaseHash: hash(after), chunks, newBytesStored, newChunkCount,
      counts: { ...emptyDomainCounts(), transactions: 30001 } };
    const restoring = performance.now();
    const restoredHash = createHash("sha256");
    for (const chunk of chunks) {
      const content = new Uint8Array(await files.get(chunk.hash)!.arrayBuffer());
      if (hash(content) !== chunk.hash) throw new Error("Fixture chunk corrupted");
      restoredHash.update(content);
    }
    if (restoredHash.digest("hex") !== manifest.databaseHash) throw new Error("Fixture reconstruction mismatch");
    const verifyRestoreMs = performance.now() - restoring;
    const gcStart = performance.now();
    const known = new Set(files.keys());
    const live = new Set(chunks.map((chunk) => chunk.hash));
    const garbage = [...known].filter((key) => !live.has(key));
    const enumerateGcMs = performance.now() - gcStart;
    rows.push({ chunkSize, references: chunks.length, initialFiles, filesAfterEdit: files.size,
      newBytesStored, newChunkCount, manifestBytes: Buffer.byteLength(JSON.stringify(manifest)),
      hashAndChunkMs, verifyRestoreMs, enumerateGcMs, garbageCandidates: garbage.length });
  }
  return { pageSize, totalBytes: after.length, changedPageRanges, rows };
}
