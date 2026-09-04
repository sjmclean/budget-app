import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import Database from "better-sqlite3";
import * as contracts from "../../apps/web/src/features/persistence/localFirst/contracts";
import * as schema from "../../apps/web/src/features/persistence/localFirst/registerSchema";
import { compareSqliteImages } from "./sqlitePageDiff";

const source = readFileSync(new URL("../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("worker.ts", source, ts.ScriptTarget.Latest, true);
// Execute shipped function bodies, not a second implementation of persistence.
const functions = ts.transpile(parsed.statements.filter(ts.isFunctionDeclaration).map(n => n.getText(parsed)).join("\n"), {target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext});
const timestamp = "2026-09-04T00:00:00.000Z";
export function workerHarness(database: InstanceType<typeof Database>) {
  const statements: {sql:string;changedRows:number}[] = [];
  const context = { ...contracts, ...schema, activeBudgetId:"audit", activeSyncEpoch:"epoch", activeFilename:"audit.sqlite", durable:true,
    BUDGET_PROJECTION_ENGINE_VERSION:5,
    Date:class extends Date { constructor() { super(timestamp); } },
    database:{exec(options: string | {sql:string;bind?:unknown[];returnValue?:string}) {
      const {sql,bind = [],returnValue} = typeof options === "string" ? {sql:options} : options;
      const previous = database.prepare("SELECT total_changes() AS n").get() as {n:number};
      let result;
      if (returnValue) result = database.prepare(sql).all(...bind);
      else if (bind.length) database.prepare(sql).run(...bind);
      else database.exec(sql);
      const current = database.prepare("SELECT total_changes() AS n").get() as {n:number};
      statements.push({sql:sql.replace(/\s+/g," ").trim(), changedRows:current.n-previous.n});
      return result;
    }} };
  const worker = runInNewContext(`${functions}\n({initialiseSchema, upsertTransaction, writeTransactionBatch, writeTransaction, deleteTransaction, applyMutation, currentManifest})`, context);
  return {worker, statements};
}

type MutableTransaction = { -readonly [Key in keyof schema.LocalTransactionRecord]: schema.LocalTransactionRecord[Key] };
export function fixtureRecord(i:number): MutableTransaction {
  return { id:`transaction-${String(i).padStart(6,"0")}`,budgetId:"audit",accountId:`account-${i%8}`,
    date:`2024-${String(i%12+1).padStart(2,"0")}-${String(i%27+1).padStart(2,"0")}`,amount:-(i%50000+1),
    memo:`Imported supermarket purchase ${i}`.padEnd(360,"."),checkNumber:null,clearedStatus:"uncleared",
    payeeId:`payee-${i%300}`,payeeName:`Merchant ${i%300}`,rawPayeeName:`MERCHANT ${i%300}`,
    categoryId:`category-${i%80}`,categoryName:`Category ${i%80}`,transferAccountId:null,transferTransactionId:null,
    generatedFromSchedule:false,scheduledTransactionId:null,scheduledOccurrenceDate:null,updatedAt:"2024-12-31T00:00:00.000Z",
    splitLines:i%20 === 0 ? [0,1].map(n=>({id:`split-${n}`,categoryId:`category-${n}`,categoryName:`Category ${n}`,transferAccountId:null,transferTransactionId:null,memo:`Part ${n}`,amount:n===0 ? -1 : -(i%50000)})) : [],
    tagIds:i%3===0 ? ["groceries","imported"] : [],
    importProvenance:[{fileType:"csv",identity:`source-${i}`,occurrence:1,importedAt:"2024-12-31T00:00:00.000Z"}] };
}

export function createChurnFixture(count = 20769, warmCache = false) {
  const database = new Database(":memory:");
  database.pragma("page_size=8192");
  const {worker} = workerHarness(database);
  worker.initialiseSchema();
  database.transaction(() => {
    for (let i=0;i<8;i++) database.prepare("INSERT INTO local_accounts(id,budget_id,name,type,participation,opening_balance,currency_code,created_at) VALUES (?, 'audit', ?, 'checking', 'budget', 0, 'AUD', ?)").run(`account-${i}`,`Account ${i}`,timestamp);
    for (let i=0;i<300;i++) database.prepare("INSERT INTO local_payees(id,budget_id,name) VALUES (?, 'audit', ?)").run(`payee-${i}`,`Merchant ${i}`);
    for (let i=0;i<80;i++) database.prepare("INSERT INTO local_categories(id,budget_id,group_id,group_name,name) VALUES (?, 'audit','group','Expenses',?)").run(`category-${i}`,`Category ${i}`);
    for (let i=0;i<count;i++) worker.upsertTransaction(fixtureRecord(i));
    database.prepare("INSERT INTO local_budget_metadata VALUES ('localRevision','100')").run();
    database.prepare("INSERT INTO local_budget_assignments VALUES ('audit','2024-01','category-1',1000,?)").run(timestamp);
    // Deliberately controlled cache-size sensitivity, NOT a measured browser cache distribution.
    if (warmCache) for(let month=1;month<=12;month++) database.prepare("INSERT INTO local_budget_projection_cache VALUES ('audit',?,5,?,?)").run(`2024-${String(month).padStart(2,"0")}`,JSON.stringify({fixturePadding:"x".repeat(256*1024)}),timestamp);
  })();
  const bytes = database.serialize(); database.close(); return bytes;
}

export function runMutation(before:Buffer, kind:string) {
  const database = new Database(before);
  database.pragma("foreign_keys=ON");
  const {worker,statements} = workerHarness(database);
  const record = fixtureRecord(kind === "split" ? 120 : 121);
  record.updatedAt = timestamp;
  const mutation = (payload:unknown, sequence=1, domain="transactions", operation="upsert",entityId=record.id) => ({budgetId:"audit",syncEpoch:"epoch",mutationId:`mutation-${sequence}`,deviceId:"audit-device",deviceSequence:sequence,baseCursor:0,domain,entityId,operation,payload,createdAt:timestamp});
  try {
    if (kind === "delete") worker.deleteTransaction(record.id,mutation(null,1,"transactions","delete"));
    else if(kind === "assignment") worker.applyMutation(mutation({kind:"category-assignment",month:"2024-01",categoryId:"category-1",assigned:1200},1,"budgetMonths","upsert","assignment:2024-01:category-1"));
    else {
      if(kind === "memo" || kind === "split") record.memo = "Corrected memo";
      if(kind === "amount") record.amount -= 100;
      if(kind === "payee") {record.payeeId="payee-299";record.payeeName="Merchant 299";}
      if(kind === "cleared") record.clearedStatus="cleared";
      if(kind === "add") record.id="transaction-new";
      const writes=[{transaction:record,mutation:mutation(record,1,"transactions","upsert",record.id)}];
      if(kind === "cleared") worker.writeTransaction(record,writes[0].mutation);
      else worker.writeTransactionBatch(writes,kind==="add"?[record.id]:[]);
    }
    const revision = Number((database.prepare("SELECT value FROM local_budget_metadata WHERE key='localRevision'").get() as {value:string}).value);
    const logicalMutations = (database.prepare("SELECT count(*) AS n FROM local_budget_outbox").get() as {n:number}).n;
    const after = database.serialize();
    return {kind,logicalMutations,revisionDelta:revision-100,statements,report:compareSqliteImages(before,after),after};
  } finally { database.close(); }
}
