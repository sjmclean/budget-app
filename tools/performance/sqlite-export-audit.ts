import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import init from "../../apps/web/node_modules/@sqlite.org/sqlite-wasm/dist/node.mjs";
import { createChurnFixture, workerHarness, fixtureRecord } from "./sqliteChurnFixture";
import { compareSqliteImages } from "./sqlitePageDiff";

const compact = (before:Uint8Array,after:Uint8Array) => {
  const r=compareSqliteImages(before,after,false);
  return {changedPages:r.changedPages,differingBytes:r.differingBytes,ranges:r.ranges,before:r.before,after:r.after};
};
const seed=createChurnFixture(400);
const sqlite=await init();
const db=new sqlite.oo1.DB(":memory:");
const pointer=sqlite.wasm.allocFromTypedArray(Uint8Array.from(seed));
try {
  const rc=sqlite.capi.sqlite3_deserialize(db.pointer,"main",pointer,BigInt(seed.length),BigInt(seed.length),0);
  assert.equal(rc,0);
  const underlying = () => Buffer.concat(db.exec({sql:"SELECT data FROM sqlite_dbpage ORDER BY pgno",returnValue:"resultRows",rowMode:"object"}).map((row:{data:Uint8Array})=>Buffer.from(row.data)));
  const exported = () => sqlite.capi.sqlite3_js_db_export(db.pointer);
  const beforePages=underlying(),beforeExport=exported();
  const repeated=compact(beforeExport,exported());
  db.exec({sql:"UPDATE local_transactions SET memo=? WHERE id=?",bind:["Export probe",fixtureRecord(121).id]});
  const afterPages=underlying(),afterExport=exported();
  assert.deepEqual(Buffer.from(beforeExport),beforePages);
  assert.deepEqual(Buffer.from(afterExport),afterPages);
  console.log(JSON.stringify({runtime:sqlite.version.libVersion,scope:"Bundled sqlite3_js_db_export versus sqlite_dbpage, deserialized real schema; isolated direct memo UPDATE, not UI or OPFS",repeated,exportExcess:compact(afterPages,afterExport),underlyingMutation:compact(beforePages,afterPages),exportMutation:compact(beforeExport,afterExport)},null,2));
} finally { db.close();sqlite.wasm.dealloc(pointer); }

// Native file/WAL equivalence probe. Not a browser OPFS/SAH API test.
const directory=mkdtempSync(join(tmpdir(),"sqlite-export-audit-"));
const filename=join(directory,"audit.sqlite");
let native:InstanceType<typeof Database>|undefined;
try {
  const initial=new Database(seed);await initial.backup(filename);initial.close();
  native=new Database(filename);native.pragma("journal_mode=WAL");native.pragma("wal_checkpoint(TRUNCATE)");
  const before=native.serialize();
  const {worker}=workerHarness(native);const transaction=fixtureRecord(121);transaction.memo="WAL probe";
  worker.writeTransactionBatch([{transaction,mutation:{budgetId:"audit",syncEpoch:"epoch",mutationId:"wal-probe",deviceId:"device",deviceSequence:1,baseCursor:0,domain:"transactions",entityId:transaction.id,operation:"upsert",payload:transaction,createdAt:"2026-09-04T00:00:00.000Z"}}]);
  const exported=native.serialize(),staleMain=readFileSync(filename);
  const repeat=compact(exported,native.serialize());
  native.pragma("wal_checkpoint(TRUNCATE)");
  const checkpointed=readFileSync(filename);
  const normalised=Buffer.from(exported);normalised[18]=normalised[19]=1;
  assert.deepEqual(checkpointed,exported);
  console.log(JSON.stringify({runtime:native.prepare("SELECT sqlite_version() AS version").get(),scope:"Native file simulates OPFS raw main-file/SAH raw-byte semantics; WAL serializer is better-sqlite3, not bundled browser WAL VFS",mutation:compact(before,exported),uncheckpointedMainVsExport:compact(staleMain,exported),checkpointedMainVsExport:compact(checkpointed,exported),repeated:repeat,captureHeaderNormalisation:compact(exported,normalised)},null,2));
} finally {native?.close();rmSync(directory,{recursive:true,force:true});}
