import assert from "node:assert/strict";
import test from "node:test";
import { buildScheduledPreview, readScheduledPreviewDays, writeScheduledPreviewDays, SCHEDULED_PREVIEW_DAYS_KEY } from "../../../apps/web/src/features/accounts/scheduledTransactionPreview";
import { createFixedBudgetScopedStorage, getBudgetScopedStorageKey, isBudgetScopedStorageKey } from "../../../apps/web/src/features/budget/budgetDataScope";
import type { ScheduledTransactionView } from "../../../apps/web/src/features/accounts/scheduledTransactionTypes";

const schedule=(id:string,date:string)=>({id,accountId:"a",nextDueDate:date,frequency:"once",payee:id,category:"",outflow:1,inflow:0,createdAt:"",updatedAt:""}) as ScheduledTransactionView;
test("preview horizons include overdue and boundary dates, exclude later dates, and sort deterministically",()=>{
  const values=[schedule("z","2026-09-01"),schedule("b","2026-09-12"),schedule("a","2026-09-12"),schedule("later","2026-10-06")];
  for(const [days,boundary] of [[3,"2026-09-08"],[7,"2026-09-12"],[14,"2026-09-19"],[30,"2026-10-05"]] as const){
    const result=buildScheduledPreview([...values,schedule(`edge-${days}`,boundary)],"2026-09-05",days);
    assert.ok(result.items.some(item=>item.id==="z"));assert.ok(result.items.some(item=>item.id===`edge-${days}`));assert.ok(!result.items.some(item=>item.id==="later"));
  }
  assert.deepEqual(buildScheduledPreview(values,"2026-09-05",7).items.map(x=>x.id),["z","a","b"]);
});
test("preview caps visible items at five and reports remainder",()=>{const result=buildScheduledPreview(Array.from({length:8},(_,i)=>schedule(String(i),"2026-09-06")),"2026-09-05",7);assert.equal(result.items.length,5);assert.equal(result.total,8);assert.equal(result.remaining,3)});
test("budget-scoped preset preference defaults safely and round-trips",()=>{
  const values=new Map<string,string>();const raw={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
  const storage=createFixedBudgetScopedStorage(raw,"budget-a");assert.equal(isBudgetScopedStorageKey(SCHEDULED_PREVIEW_DAYS_KEY),true);assert.equal(readScheduledPreviewDays(storage),7);
  for(const value of [3,7,14,30] as const){writeScheduledPreviewDays(storage,value);assert.equal(readScheduledPreviewDays(storage),value)}
  values.set(getBudgetScopedStorageKey("budget-a",SCHEDULED_PREVIEW_DAYS_KEY),"12");assert.equal(readScheduledPreviewDays(storage),7);
  assert.equal(values.has(SCHEDULED_PREVIEW_DAYS_KEY),false);
});
