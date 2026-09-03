import { createSHA256 } from "hash-wasm";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import { retainRestorePoints } from "./restorePointRetention";
import { RESTORE_POINT_REASONS, type RestorePointMetadata } from "./restorePointTypes";
import { REQUIRED_BUDGET_DOMAINS } from "../persistence/localFirst/contracts";

export const RESTORE_POINT_DIRECTORY = "budget-app-sqlite-restore-points";
const CHUNK_BYTES = 4 * 1024 * 1024;
const SAFE_ID = /^[a-zA-Z0-9-]{1,100}$/;

/** Payloads and manifests live outside active generations and budget KV cleanup. */
export interface RestorePointFiles {
  names(): Promise<string[]>;
  read(name: string): Promise<File>;
  write(name: string, chunks: AsyncIterable<Uint8Array>): Promise<void>;
  remove(name: string): Promise<void>;
}

/** Fixed-width UTF-16 encoding is injective, even for unpaired surrogates.
 * Only ASCII hex reaches OPFS: no separators, dot segments or normalization collisions.
 */
export function restorePointBudgetDirectory(budgetId: string): string {
  if (typeof budgetId !== "string" || !budgetId) throw new Error("Invalid restore point budget id.");
  let encoded = "budget-";
  for (let index = 0; index < budgetId.length; index++) {
    encoded += budgetId.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return encoded;
}

export function opfsRestorePointFiles(budgetId: string): RestorePointFiles {
  const budgetDirectory = restorePointBudgetDirectory(budgetId);
  async function directory() {
    const root = await navigator.storage.getDirectory();
    const parent = await root.getDirectoryHandle(RESTORE_POINT_DIRECTORY, { create: true });
    return parent.getDirectoryHandle(budgetDirectory, { create: true });
  }
  return {
    async names() {
      const dir = await directory();
      const names: string[] = [];
      for await (const name of (dir as FileSystemDirectoryHandle & {
        keys(): AsyncIterableIterator<string>;
      }).keys()) names.push(name);
      return names;
    },
    async read(name) { return (await (await directory()).getFileHandle(name)).getFile(); },
    async write(name, chunks) {
      const file = await (await directory()).getFileHandle(name, { create: true });
      const writer = await file.createWritable();
      try {
        for await (const chunk of chunks) await writer.write(Uint8Array.from(chunk));
        // OPFS writable close completes the atomic file publication.
        await writer.close();
      } catch (error) {
        await writer.abort().catch(() => undefined);
        throw error;
      }
    },
    async remove(name) { await (await directory()).removeEntry(name); },
  };
}

function payloadName(id: string) {
  if (!SAFE_ID.test(id)) throw new Error("Invalid restore point id.");
  return `${id}.sqlite3`;
}

function validateMetadata(value: unknown): RestorePointMetadata {
  const point = value as RestorePointMetadata;
  if (!point || point.schema !== "sqlite-restore-point.v1" ||
      !SAFE_ID.test(point.id) || !point.budgetId || !point.syncEpoch ||
      typeof point.budgetName !== "string" ||
      !Number.isSafeInteger(point.localRevision) || point.localRevision < 0 ||
      !Number.isSafeInteger(point.mutationCount) || point.mutationCount < 0 ||
      REQUIRED_BUDGET_DOMAINS.some((domain) => !Number.isSafeInteger(point.counts?.[domain]) || point.counts[domain] < 0) ||
      !Number.isFinite(Date.parse(point.createdAt)) ||
      !RESTORE_POINT_REASONS.includes(point.reason) ||
      !Number.isSafeInteger(point.totalBytes) || point.totalBytes < 512 ||
      !/^sha256:[a-f0-9]{64}$/.test(point.contentHash)) {
    throw new Error("Invalid SQLite restore point metadata.");
  }
  return point;
}

async function* bytes(content: Uint8Array) { yield content; }

export async function hashSqliteFile(file: File): Promise<string> {
  const header = new Uint8Array(await file.slice(0, 100).arrayBuffer());
  const pageSize = header[16] === 0 && header[17] === 1
    ? 65_536 : header[16] * 256 + header[17];
  if (header.length !== 100 ||
      new TextDecoder().decode(header.subarray(0, 16)) !== "SQLite format 3\0" ||
      pageSize < 512 || pageSize > 65_536 || (pageSize & (pageSize - 1)) !== 0 ||
      file.size % pageSize !== 0) {
    throw new Error("Restore point is not a complete SQLite database.");
  }
  const hasher = await createSHA256();
  hasher.init();
  for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
    hasher.update(new Uint8Array(await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer()));
  }
  return `sha256:${hasher.digest("hex")}`;
}

export function createRestorePointStore(
  filesForBudget: (budgetId: string) => RestorePointFiles = opfsRestorePointFiles,
) {
  async function list(budgetId: string): Promise<RestorePointMetadata[]> {
    const files = filesForBudget(budgetId);
    const points: RestorePointMetadata[] = [];
    for (const name of await files.names()) {
      if (!name.endsWith(".json")) continue;
      // A malformed manifest is reported rather than silently presenting an
      // incomplete recovery catalogue as successful.
      const raw = await (await files.read(name)).text();
      // Creating a unique OPFS handle exposes an empty file until writable
      // close commits its contents. Empty manifests are unpublished orphans.
      if (!raw) continue;
      const point = validateMetadata(JSON.parse(raw));
      if (name !== `${point.id}.json`) throw new Error("Restore point filename mismatch.");
      if (point.budgetId !== budgetId) throw new Error("Restore point budget mismatch.");
      points.push(point);
    }
    return points.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  async function read(budgetId: string, id: string) {
    payloadName(id);
    const files = filesForBudget(budgetId);
    const point = validateMetadata(JSON.parse(await (await files.read(`${id}.json`)).text()));
    if (point.budgetId !== budgetId || point.id !== id) throw new Error("Restore point budget mismatch.");
    const file = await files.read(payloadName(id));
    if (file.size !== point.totalBytes || await hashSqliteFile(file) !== point.contentHash) {
      throw new Error("Restore point failed SQLite payload integrity validation.");
    }
    return { point, file };
  }

  async function capture(
    metadata: Omit<RestorePointMetadata, "schema" | "id" | "contentHash" | "totalBytes">,
    totalBytes: number,
    readChunk: (offset: number, length: number) => Promise<Uint8Array>,
  ) {
    const files = filesForBudget(metadata.budgetId);
    const existing = await list(metadata.budgetId);
    const equivalent = existing.find((point) => point.reason === metadata.reason &&
      point.syncEpoch === metadata.syncEpoch && point.localRevision === metadata.localRevision);
    if (equivalent) return equivalent;
    const id = createRuntimeUuid();
    const name = payloadName(id);
    let published = false;
    try {
      const hasher = await createSHA256();
      hasher.init();
      async function* chunks() {
        for (let offset = 0; offset < totalBytes;) {
          const length = Math.min(CHUNK_BYTES, totalBytes - offset);
          const chunk = await readChunk(offset, length);
          if (chunk.byteLength !== length) throw new Error("SQLite snapshot ended unexpectedly.");
          hasher.update(chunk);
          offset += length;
          yield chunk;
        }
      }
      await files.write(name, chunks());
      const file = await files.read(name);
      const contentHash = `sha256:${hasher.digest("hex")}`;
      if (file.size !== totalBytes || await hashSqliteFile(file) !== contentHash) {
        throw new Error("Written SQLite snapshot failed integrity validation.");
      }
      const point: RestorePointMetadata = {
        ...metadata, schema: "sqlite-restore-point.v1", id, totalBytes, contentHash,
      };
      await files.write(`${id}.json`, bytes(new TextEncoder().encode(JSON.stringify(point))));
      published = true;
      // Metadata removal precedes physical pruning. A failure leaks storage,
      // never a listed point whose payload was removed, nor the new checkpoint.
      for (const old of retainRestorePoints([...existing, point], Date.parse(point.createdAt)).pruned) {
        if (old.id === point.id) continue;
        try {
          await files.remove(`${old.id}.json`);
          await files.remove(payloadName(old.id));
        } catch (error) {
          console.warn("Restore point retained; older payload cleanup failed.", error);
        }
      }
      return point;
    } catch (error) {
      if (!published) {
        // Close may have completed even if its acknowledgement failed. Never
        // remove a payload while a possibly published manifest names it.
        try {
          const metadataName = `${id}.json`;
          if (!(await files.names()).includes(metadataName)) {
            await files.remove(name);
          } else if (!(await (await files.read(metadataName)).text())) {
            await files.remove(metadataName);
            await files.remove(name);
          }
        } catch {
          // An unreadable manifest is not proof of absence. Keep the payload
          // rather than risk deleting a completed, published recovery point.
        }
      }
      throw error;
    }
  }
  return { list, read, capture };
}
