import { createHash } from "node:crypto";
import Database from "better-sqlite3";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const u32 = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);

export function sqliteHeader(bytes: Uint8Array) {
  if (bytes.length < 100 || Buffer.from(bytes.subarray(0, 16)).toString("binary") !== "SQLite format 3\0") throw new Error("Not a complete SQLite header");
  const encoded = bytes[16] * 256 + bytes[17];
  const pageSize = encoded === 1 ? 65536 : encoded;
  if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1))) throw new Error("Invalid SQLite page size");
  return { pageSize, bytes: bytes.length, pages: Math.ceil(bytes.length / pageSize), partialFinalPageBytes: bytes.length % pageSize,
    writeVersion: bytes[18], readVersion: bytes[19], changeCounter: u32(bytes, 24), headerPageCount: u32(bytes, 28),
    firstFreelistTrunk: u32(bytes, 32), freelistPages: u32(bytes, 36), schemaCookie: u32(bytes, 40), versionValidFor: u32(bytes, 92) };
}

/** New UNIQUE content only, including a short final chunk; no catalogue/manifest overhead. */
export function contentCost(before: Uint8Array, after: Uint8Array, chunkSize: number) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new Error("Invalid chunk size");
  const known = new Set<string>();
  for (let offset = 0; offset < before.length; offset += chunkSize) known.add(hash(before.subarray(offset, offset + chunkSize)));
  let newBytes = 0, newChunks = 0;
  for (let offset = 0; offset < after.length; offset += chunkSize) {
    const chunk = after.subarray(offset, offset + chunkSize), key = hash(chunk);
    if (!known.has(key)) { known.add(key); newBytes += chunk.length; newChunks++; }
  }
  return { chunkSize, references: Math.ceil(after.length / chunkSize), newChunks, newBytes };
}

export function pageOwners(bytes: Uint8Array) {
  const owners = new Map<number, string>();
  let limitation: string | null = null;
  let database: InstanceType<typeof Database> | undefined;
  try {
    // Deserialize a copy in memory: never open or modify the supplied user file.
    database = new Database(Buffer.from(bytes));
    database.pragma("query_only = ON");
    for (const row of database.prepare("SELECT name, pageno, pagetype FROM dbstat ORDER BY pageno").all() as {name:string;pageno:number;pagetype:string}[]) owners.set(row.pageno, `${row.name}:${row.pagetype}`);
  } catch (error) { limitation = `dbstat unavailable or image not queryable: ${(error as Error).message}`; }
  finally { database?.close(); }
  const header = sqliteHeader(bytes);
  let trunk = header.firstFreelistTrunk;
  const visited = new Set<number>();
  while (trunk && !visited.has(trunk)) {
    visited.add(trunk);
    const offset = (trunk - 1) * header.pageSize;
    if (offset < 0 || offset + header.pageSize > bytes.length) break;
    owners.set(trunk, "freelist:trunk");
    const count = u32(bytes, offset + 4);
    if (count > header.pageSize / 4 - 2) break;
    for (let i = 0; i < count; i++) owners.set(u32(bytes, offset + 8 + 4 * i), "freelist:leaf");
    trunk = u32(bytes, offset);
  }
  return { owners, limitation };
}

export function compareSqliteImages(before: Uint8Array, after: Uint8Array, mapObjects = true) {
  const a = sqliteHeader(before), b = sqliteHeader(after);
  if (a.pageSize !== b.pageSize) throw new Error("Page sizes differ; page identity is not comparable");
  const pageSize = a.pageSize, totalPages = Math.max(a.pages, b.pages);
  const oldOwners = mapObjects ? pageOwners(before) : { owners: new Map<number,string>(), limitation: "Object mapping disabled" };
  const newOwners = mapObjects ? pageOwners(after) : { owners: new Map<number,string>(), limitation: "Object mapping disabled" };
  const changed: {page:number;offset:number;differingBytes:number;beforeOwner:string;afterOwner:string}[] = [];
  const ranges: [number,number][] = [];
  let representedBytes = 0, differingBytes = 0;
  for (let page = 1; page <= totalPages; page++) {
    const offset = (page - 1) * pageSize;
    const left = before.subarray(offset, offset + pageSize), right = after.subarray(offset, offset + pageSize);
    let count = 0;
    for (let i = 0; i < Math.max(left.length, right.length); i++) if (left[i] !== right[i]) count++;
    if (!count) continue;
    changed.push({ page, offset, differingBytes: count, beforeOwner: oldOwners.owners.get(page) ?? (page > a.pages ? "absent" : "unmapped"), afterOwner: newOwners.owners.get(page) ?? (page > b.pages ? "absent" : "unmapped") });
    representedBytes += Math.max(left.length, right.length); differingBytes += count;
    const last = ranges.at(-1);
    if (last && last[1] === page - 1) last[1] = page; else ranges.push([page,page]);
  }
  const distribution = Array.from({length:10}, (_, decile) => ({ decile, changedPages: changed.filter(p => Math.min(9, Math.floor((p.page - 1) * 10 / totalPages)) === decile).length }));
  const objectChanges: Record<string,{pages:number;differingBytes:number}> = {};
  for (const p of changed) {
    const key = p.beforeOwner === p.afterOwner ? p.afterOwner : `${p.beforeOwner} -> ${p.afterOwner}`;
    const group = objectChanges[key] ??= {pages:0,differingBytes:0}; group.pages++; group.differingBytes += p.differingBytes;
  }
  return { before:a, after:b, totalPages, changedPages:changed.length, unchangedPages:totalPages-changed.length,
    changedPercent:totalPages ? changed.length * 100 / totalPages : 0, representedBytes, differingBytes, ranges, distribution, objectChanges,
    mappingLimitations:[oldOwners.limitation,newOwners.limitation].filter(Boolean), changed,
    costs:[...new Set([pageSize,8192,16384,32768,65536,131072,262144])].sort((x,y)=>x-y).map(size => ({...contentCost(before,after,size), pageAligned:size % pageSize === 0})),
    notes:"Page numbers are 1-based; denominator is union of before/after pages. Added/deleted bytes count as differences. Partial pages are reported, not padded. Costs reuse all unique before chunks and deduplicate within after; exclude manifests, filesystem overhead and older snapshots. Object attribution is physical, not logical field attribution; freed bytes can retain old payloads." };
}
