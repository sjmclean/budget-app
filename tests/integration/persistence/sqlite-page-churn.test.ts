import assert from "node:assert/strict";
import test from "node:test";
import { createChurnFixture, runMutation } from "../../../tools/performance/sqliteChurnFixture";

test("real worker writes preserve unchanged SQLite pages and expose ancillary writes",()=>{
  const before=createChurnFixture(400);
  for(const kind of ["memo","amount","payee","cleared","add","delete","assignment","split"]) {
    const {report,revisionDelta,logicalMutations,statements}=runMutation(before,kind);
    assert.equal(revisionDelta,1);assert.equal(logicalMutations,1);
    assert.equal(report.before.pageSize,8192);assert.ok(report.changedPages>0);assert.ok(report.unchangedPages>0);
    assert.equal(report.mappingLimitations.length,0);
    assert.ok(report.costs[0].newBytes<=report.costs.find(c=>c.chunkSize===65536)!.newBytes);
    if(kind==="memo") {
      assert.ok(statements.some(s=>s.sql.startsWith("DELETE FROM local_transaction_import_provenance")&&s.changedRows===1));
      assert.ok(statements.some(s=>s.sql.startsWith("DELETE FROM local_budget_projection_cache")));
      assert.ok(statements.some(s=>s.sql.startsWith("INSERT INTO local_budget_outbox")&&s.changedRows===1));
    }
  }
});
