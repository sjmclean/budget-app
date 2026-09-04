import { createSHA256 } from "hash-wasm";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import { retainRestorePoints } from "./restorePointRetention";
import { RESTORE_POINT_REASONS, type RestorePointCaptureMetadata, type RestorePointMetadata } from "./restorePointTypes";
import { REQUIRED_BUDGET_DOMAINS } from "../persistence/localFirst/contracts";

export const RESTORE_POINT_DIRECTORY = "budget-app-sqlite-restore-points";
// A multiple of every supported SQLite page size (512 through 65536 bytes).
export const RESTORE_POINT_CHUNK_BYTES = 256 * 1024;
const SAFE_ID = /^[a-zA-Z0-9-]{1,100}$/;
const HASH = /^[a-f0-9]{64}$/;
type Directory = "manifests" | "chunks";

/** Every read/capture/GC holds the same cross-context, per-budget lock.
 * write must atomically publish complete contents on close, never partial bytes.
 */
export interface RestorePointFiles {
  exclusive<T>(operation: () => Promise<T>): Promise<T>;
  names(directory: Directory): Promise<string[]>;
  read(directory: Directory, name: string): Promise<File>;
  write(directory: Directory, name: string, chunks: AsyncIterable<Uint8Array>): Promise<void>;
  remove(directory: Directory, name: string): Promise<void>;
}

/** Injective UTF-16 encoding: no separators, dot segments or Unicode normalization. */
export function restorePointBudgetDirectory(budgetId: string): string {
  if (typeof budgetId !== "string" || !budgetId) throw new Error("Invalid restore point budget id.");
  let encoded = "budget-";
  for (let index = 0; index < budgetId.length; index++) encoded += budgetId.charCodeAt(index).toString(16).padStart(4, "0");
  return encoded;
}

export function opfsRestorePointFiles(budgetId: string): RestorePointFiles {
  const budgetDirectory = restorePointBudgetDirectory(budgetId);
  async function directory(kind: Directory) {
    const root = await navigator.storage.getDirectory();
    const parent = await root.getDirectoryHandle(RESTORE_POINT_DIRECTORY, { create: true });
    const budget = await parent.getDirectoryHandle(budgetDirectory, { create: true });
    return budget.getDirectoryHandle(kind, { create: true });
  }
  return {
    async exclusive(operation) {
      // No unsafe in-process fallback: workers/tabs must agree with GC and restore.
      if (!navigator.locks) throw new Error("Restore points require Web Locks for safe storage access.");
      return navigator.locks.request(`${RESTORE_POINT_DIRECTORY}:${budgetDirectory}`, operation);
    },
    async names(kind) {
      const dir = await directory(kind);
      const names: string[] = [];
      for await (const name of (dir as FileSystemDirectoryHandle & { keys(): AsyncIterableIterator<string> }).keys()) names.push(name);
      return names;
    },
    async read(kind, name) { return (await (await directory(kind)).getFileHandle(name)).getFile(); },
    async write(kind, name, chunks) {
      const file = await (await directory(kind)).getFileHandle(name, { create: true });
      const writer = await file.createWritable();
      try {
        for await (const chunk of chunks) await writer.write(Uint8Array.from(chunk));
        await writer.close();
      } catch (error) {
        await writer.abort().catch(() => undefined);
        throw error;
      }
    },
    async remove(kind, name) { await (await directory(kind)).removeEntry(name); },
  };
}

function manifestName(id: string) {
  if (typeof id !== "string" || !SAFE_ID.test(id)) throw new Error("Invalid restore point id.");
  return `${id}.json`;
}

function validateMetadata(value: unknown): RestorePointMetadata {
  const point = value as RestorePointMetadata;
  if (!point || point.schema !== "sqlite-restore-point.v2" ||
      typeof point.id !== "string" || !SAFE_ID.test(point.id) ||
      typeof point.budgetId !== "string" || !point.budgetId || typeof point.syncEpoch !== "string" || !point.syncEpoch ||
      typeof point.budgetName !== "string" || typeof point.createdAt !== "string" ||
      !Number.isSafeInteger(point.localRevision) || point.localRevision < 0 ||
      !Number.isSafeInteger(point.mutationCount) || point.mutationCount < 0 ||
      REQUIRED_BUDGET_DOMAINS.some((domain) => !Number.isSafeInteger(point.counts?.[domain]) || point.counts[domain] < 0) ||
      !Number.isFinite(Date.parse(point.createdAt)) || !RESTORE_POINT_REASONS.includes(point.reason) ||
      !Number.isSafeInteger(point.totalBytes) || point.totalBytes < 512 ||
      typeof point.databaseHash !== "string" || !HASH.test(point.databaseHash) ||
      !Array.isArray(point.chunks) || point.chunks.length !== Math.ceil(point.totalBytes / RESTORE_POINT_CHUNK_BYTES) ||
      point.chunks.some((chunk, index) => !chunk || typeof chunk.hash !== "string" || !HASH.test(chunk.hash) ||
        chunk.length !== Math.min(RESTORE_POINT_CHUNK_BYTES, point.totalBytes - index * RESTORE_POINT_CHUNK_BYTES)) ||
      !Number.isSafeInteger(point.newBytesStored) || point.newBytesStored < 0 || point.newBytesStored > point.totalBytes ||
      !Number.isSafeInteger(point.newChunkCount) || point.newChunkCount < 0 || point.newChunkCount > point.chunks.length) {
    throw new Error("Invalid SQLite restore point metadata.");
  }
  return point;
}

async function* bytes(content: Uint8Array) { yield content; }
async function hash(content: Uint8Array) {
  const hasher = await createSHA256();
  hasher.init(); hasher.update(content);
  return hasher.digest("hex");
}

function validateSqliteHeader(header: Uint8Array, totalBytes: number) {
  const pageSize = header[16] === 0 && header[17] === 1 ? 65_536 : header[16] * 256 + header[17];
  if (header.length < 100 || new TextDecoder().decode(header.subarray(0, 16)) !== "SQLite format 3\0" ||
      pageSize < 512 || pageSize > 65_536 || (pageSize & (pageSize - 1)) !== 0 || totalBytes % pageSize !== 0) {
    throw new Error("Restore point is not a complete SQLite database.");
  }
}

async function verifiedChunk(files: RestorePointFiles, name: string, expectedHash: string, length: number) {
  const file = await files.read("chunks", name);
  if (file.size !== length) throw new Error("Restore point chunk length mismatch.");
  const content = new Uint8Array(await file.arrayBuffer());
  if (await hash(content) !== expectedHash) throw new Error("Restore point chunk integrity validation failed.");
  return content;
}

export function createRestorePointStore(filesForBudget: (budgetId: string) => RestorePointFiles = opfsRestorePointFiles) {
  async function listUnlocked(files: RestorePointFiles, budgetId: string) {
    const points: RestorePointMetadata[] = [];
    for (const name of await files.names("manifests")) {
      if (!name.endsWith(".json")) continue;
      const raw = await (await files.read("manifests", name)).text();
      // An empty handle left before atomic close is not a committed manifest.
      if (!raw) continue;
      const point = validateMetadata(JSON.parse(raw));
      if (name !== manifestName(point.id)) throw new Error("Restore point filename mismatch.");
      if (point.budgetId !== budgetId) throw new Error("Restore point budget mismatch.");
      points.push(point);
    }
    return points.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  async function list(budgetId: string) {
    const files = filesForBudget(budgetId);
    return files.exclusive(() => listUnlocked(files, budgetId));
  }

  // The lock spans consumption, not just manifest loading. GC cannot remove a
  // selected snapshot while reconstruction is streaming into its staged file.
  async function read<T>(budgetId: string, id: string,
    consume: (point: RestorePointMetadata, chunks: AsyncIterable<Uint8Array>) => Promise<T>) {
    const name = manifestName(id);
    const files = filesForBudget(budgetId);
    return files.exclusive(async () => {
      const point = validateMetadata(JSON.parse(await (await files.read("manifests", name)).text()));
      if (point.budgetId !== budgetId || point.id !== id) throw new Error("Restore point budget mismatch.");
      let verified = false;
      let started = false;
      async function* reconstruct() {
        if (started) throw new Error("Restore point stream can only be consumed once.");
        started = true;
        const hasher = await createSHA256(); hasher.init();
        let length = 0;
        for (const reference of point.chunks) {
          const content = await verifiedChunk(files, `${reference.hash}.bin`, reference.hash, reference.length);
          if (length === 0) validateSqliteHeader(content, point.totalBytes);
          hasher.update(content); length += content.length;
          yield content;
        }
        if (length !== point.totalBytes || hasher.digest("hex") !== point.databaseHash) {
          throw new Error("Restore point database integrity validation failed.");
        }
        verified = true;
      }
      const result = await consume(point, reconstruct());
      if (!verified) throw new Error("Restore point stream was not completely verified.");
      return result;
    });
  }

  async function garbageCollectUnlocked(files: RestorePointFiles, budgetId: string) {
    // Finish the ENTIRE catalogue scan before any delete. Corruption/read errors
    // abort GC. A reference counter is never authoritative, including after crashes.
    const points = await listUnlocked(files, budgetId);
    const live = new Set(points.flatMap((point) => point.chunks.map((chunk) => `${chunk.hash}.bin`)));
    for (const name of await files.names("chunks")) {
      if ((/^[a-f0-9]{64}\.bin$/.test(name) && !live.has(name)) || /^[a-zA-Z0-9-]+\.partial$/.test(name)) {
        await files.remove("chunks", name);
      }
    }
  }

  async function collectGarbage(budgetId: string) {
    const files = filesForBudget(budgetId);
    return files.exclusive(() => garbageCollectUnlocked(files, budgetId));
  }

  async function capture(metadata: RestorePointCaptureMetadata, totalBytes: number,
    readChunk: (offset: number, length: number) => Promise<Uint8Array>) {
    const files = filesForBudget(metadata.budgetId);
    return files.exclusive(async () => {
      const existing = await listUnlocked(files, metadata.budgetId);
      const equivalent = existing.find((point) => point.reason === metadata.reason &&
        point.syncEpoch === metadata.syncEpoch && point.localRevision === metadata.localRevision);
      if (equivalent) return equivalent;
      if (!Number.isSafeInteger(totalBytes) || totalBytes < 512) throw new Error("Invalid SQLite snapshot length.");
      const id = createRuntimeUuid();
      const known = new Set(await files.names("chunks"));
      const referenced = new Set(existing.flatMap((point) => point.chunks.map((chunk) => `${chunk.hash}.bin`)));
      const chunks: RestorePointMetadata["chunks"][number][] = [];
      const hasher = await createSHA256(); hasher.init();
      let newBytesStored = 0;
      let newChunkCount = 0;
      for (let offset = 0; offset < totalBytes; offset += RESTORE_POINT_CHUNK_BYTES) {
        const length = Math.min(RESTORE_POINT_CHUNK_BYTES, totalBytes - offset);
        const content = await readChunk(offset, length);
        if (content.length !== length) throw new Error("SQLite snapshot ended unexpectedly.");
        if (offset === 0) validateSqliteHeader(content, totalBytes);
        hasher.update(content);
        const chunkHash = await hash(content);
        const name = `${chunkHash}.bin`;
        if (known.has(name)) {
          try { await verifiedChunk(files, name, chunkHash, length); }
          catch (error) {
            // An interrupted final publication may leave an empty/invalid handle.
            // Only a complete catalogue proving it unreferenced permits removal.
            // Never repair/overwrite content used by a committed restore point.
            if (referenced.has(name)) throw error;
            await files.remove("chunks", name);
            known.delete(name);
          }
        }
        if (!known.has(name)) {
          const temporary = `${createRuntimeUuid()}.partial`;
          await files.write("chunks", temporary, bytes(content));
          const verified = await verifiedChunk(files, temporary, chunkHash, length);
          try { await files.write("chunks", name, bytes(verified)); }
          catch (error) {
            // Lost close acknowledgement is success only if final identity verifies.
            try { await verifiedChunk(files, name, chunkHash, length); } catch { throw error; }
          }
          await verifiedChunk(files, name, chunkHash, length);
          known.add(name); newBytesStored += length; newChunkCount++;
          await files.remove("chunks", temporary).catch(() => undefined);
        }
        chunks.push({ hash: chunkHash, length });
      }
      const point = validateMetadata({ ...metadata, schema: "sqlite-restore-point.v2", id,
        totalBytes, databaseHash: hasher.digest("hex"), chunks, newBytesStored, newChunkCount });
      const encoded = JSON.stringify(point);
      try { await files.write("manifests", manifestName(id), bytes(new TextEncoder().encode(encoded))); }
      catch (error) {
        // No speculative deletion after uncertain publication. Verify or leak.
        try {
          if (await (await files.read("manifests", manifestName(id))).text() !== encoded) throw error;
        } catch { throw error; }
      }
      // Manifest close is the commit point. Nothing below may invalidate it or
      // make successful capture depend on cleanup. Failed capture may leak chunks.
      try {
        for (const old of retainRestorePoints([...existing, point], Date.parse(point.createdAt)).pruned) {
          if (old.id !== point.id) await files.remove("manifests", manifestName(old.id));
        }
        await garbageCollectUnlocked(files, metadata.budgetId);
      } catch (error) { console.warn("Restore point completed; cleanup deferred.", error); }
      return point;
    });
  }
  return { list, read, capture, collectGarbage };
}
