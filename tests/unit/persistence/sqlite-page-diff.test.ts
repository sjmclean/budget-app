import assert from "node:assert/strict";
import test from "node:test";
import { compareSqliteImages, contentCost, sqliteHeader } from "../../../tools/performance/sqlitePageDiff";
import { createRestorePointStore } from "../../../apps/web/src/features/budget/restorePointStore";
import { emptyDomainCounts } from "../../../apps/web/src/features/persistence/localFirst/contracts";
import { memoryRestorePointFiles } from "../../helpers/restorePointFiles";

function image(pages=40, size=8192) {
  const bytes=Buffer.alloc(pages*size);
  for(let p=0;p<pages;p++) bytes.fill(p+1,p*size,(p+1)*size);
  bytes.write("SQLite format 3\0",0,"binary"); bytes.writeUInt16BE(size===65536?1:size,16);
  return bytes;
}
test("all legal page sizes and invalid headers",()=>{
  for(const size of [512,1024,2048,4096,8192,16384,32768,65536]) assert.equal(sqliteHeader(image(2,size)).pageSize,size);
  assert.throws(()=>sqliteHeader(Buffer.alloc(100)));
  const bad=image();bad.writeUInt16BE(1000,16);assert.throws(()=>sqliteHeader(bad));
  assert.throws(()=>compareSqliteImages(image(2,4096),image(2,8192),false));
});
test("identical, single and scattered pages; deterministic ranges and byte counts",()=>{
  const before=image(),after=Buffer.from(before);
  assert.equal(compareSqliteImages(before,after,false).changedPages,0);
  after[8192+19]++;let r=compareSqliteImages(before,after,false);
  assert.equal(r.changedPages,1);assert.equal(r.differingBytes,1);assert.deepEqual(r.ranges,[[2,2]]);
  after[2*8192+19]++;after[30*8192+19]++;
  r=compareSqliteImages(before,after,false);
  assert.deepEqual(r.ranges,[[2,3],[31,31]]);assert.equal(r.representedBytes,3*8192);
  assert.equal(r.distribution.reduce((sum,d)=>sum+d.changedPages,0),3);
  assert.deepEqual(r,compareSqliteImages(before,after,false));
});
test("growth, shrink, and partial last-page bytes are neither padded nor omitted",()=>{
  const before=image(2),after=Buffer.concat([before,Buffer.alloc(100,9)]);
  const growth=compareSqliteImages(before,after,false);
  assert.equal(growth.changedPages,1);assert.equal(growth.representedBytes,100);assert.equal(growth.after.partialFinalPageBytes,100);
  assert.equal(contentCost(before,after,8192).newBytes,100);
  const shrink=compareSqliteImages(after,before,false);assert.equal(shrink.differingBytes,100);assert.equal(shrink.costs[0].newBytes,0);
});
test("candidate amplification and unique content reuse",()=>{
  const before=image(),after=Buffer.from(before);after[8192+19]++;after[9*8192+19]++;
  assert.equal(contentCost(before,after,8192).newBytes,16384);
  assert.equal(contentCost(before,after,65536).newBytes,131072);
  const duplicate=Buffer.concat([before,before.subarray(8192,16384),before.subarray(8192,16384)]);
  assert.equal(contentCost(before,duplicate,8192).newBytes,0);
  for(let seed=0;seed<30;seed++) {
    const changed=Buffer.from(before); for(let j=0;j<20;j++) changed[100+(seed*7919+j*104729)%(changed.length-100)]^=1;
    const costs=compareSqliteImages(before,changed,false).costs;
    for(const cost of costs.filter(c=>c.pageAligned)) assert.ok(costs[0].newBytes<=cost.newBytes);
  }
});
test("64 KiB new bytes exactly match the production content-addressed store",async()=>{
  const before=image(),after=Buffer.from(before);after[8192+19]++;after[9*8192+19]++;
  // Set the fields required by production's header validation.
  for(const bytes of [before,after]) {bytes[18]=bytes[19]=1;bytes[20]=0;bytes[21]=64;bytes[22]=bytes[23]=32;}
  const files=memoryRestorePointFiles(),store=createRestorePointStore(files.forBudget);
  const metadata={budgetId:"diff",budgetName:"Diff",createdAt:"2026-09-04T00:00:00.000Z",reason:"manual" as const,syncEpoch:"epoch",localRevision:1,mutationCount:1,counts:emptyDomainCounts()};
  await store.capture(metadata,before.length,async(o,n)=>before.subarray(o,o+n));
  const point=await store.capture({...metadata,localRevision:2},after.length,async(o,n)=>after.subarray(o,o+n));
  assert.equal(point.newBytesStored,contentCost(before,after,65536).newBytes);
  assert.equal(point.newChunkCount,contentCost(before,after,65536).newChunks);
});
