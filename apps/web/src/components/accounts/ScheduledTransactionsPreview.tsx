import { CalendarClock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createFixedBudgetScopedStorage } from "../../features/budget/budgetDataScope";
import { localCalendarDate } from "../../features/dates/localCalendarDate";
import { useScheduledTransactionHistory } from "../../features/accounts/useScheduledTransactionHistory";
import { getBudgetPersistenceProvider } from "../../features/persistence";
import { getActiveKeyValueStorage } from "../../features/persistence/activeKeyValueStorage";
import { usePersistenceChangeVersion } from "../../features/persistence/persistenceChangeBus";
import { buildScheduledPreview, readScheduledPreviewDays, SCHEDULED_PREVIEW_DAY_OPTIONS, writeScheduledPreviewDays, type ScheduledPreviewDays } from "../../features/accounts/scheduledTransactionPreview";
import type { ScheduledTransactionView } from "../../features/accounts/scheduledTransactionTypes";

export function ScheduledTransactionsPreview({budgetId,accountId,currencyCode,onViewAll}:{budgetId:string|null;accountId:string;currencyCode:string;onViewAll:()=>void}) {
  const persistence=getBudgetPersistenceProvider().scheduledTransactions;
  const version=usePersistenceChangeVersion();
  const storage=useMemo(()=>budgetId?createFixedBudgetScopedStorage(getActiveKeyValueStorage(),budgetId):null,[budgetId]);
  const [days,setDays]=useState<ScheduledPreviewDays>(()=>storage?readScheduledPreviewDays(storage):7);
  const [schedules,setSchedules]=useState<ScheduledTransactionView[]>([]);
  const [busyId,setBusyId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const {enterSchedule,skipSchedule}=useScheduledTransactionHistory(budgetId,accountId);
  useEffect(()=>{setDays(storage?readScheduledPreviewDays(storage):7);},[storage]);
  useEffect(()=>{let live=true;void persistence.listByAccount(accountId).then(items=>{if(live)setSchedules(items);});return()=>{live=false};},[accountId,persistence,version]);
  const preview=useMemo(()=>buildScheduledPreview(schedules,localCalendarDate(),days),[schedules,days]);
  if(!preview.total)return null;
  const money=new Intl.NumberFormat("en-AU",{style:"currency",currency:currencyCode});
  const act=async(item:ScheduledTransactionView,action:"enter"|"skip")=>{if(busyId)return;if(action==="skip"&&!window.confirm(`Skip "${item.payee}" due ${item.nextDueDate}?\n\nThis occurrence will not be added to the register. The schedule will move to its next occurrence.`))return;setBusyId(item.id);setError(null);try{await(action==="enter"?enterSchedule(item):skipSchedule(item));setSchedules(await persistence.listByAccount(accountId));}catch(cause){setError(cause instanceof Error?cause.message:"Scheduled transaction action failed.")}finally{setBusyId(null)}};
  return <section className="register-scheduled-preview" aria-labelledby="scheduled-preview-title">
    <header><div><CalendarClock size={16} aria-hidden="true"/><strong id="scheduled-preview-title">Upcoming</strong><span>· next</span><select aria-label="Upcoming scheduled transaction horizon" value={days} onChange={e=>{const next=Number(e.target.value) as ScheduledPreviewDays;setDays(next);if(storage)writeScheduledPreviewDays(storage,next)}}>{SCHEDULED_PREVIEW_DAY_OPTIONS.map(option=><option key={option} value={option}>{option} days</option>)}</select></div><div><span>{preview.total} scheduled</span><button type="button" onClick={onViewAll}>View all scheduled</button></div></header>
    <div className="register-scheduled-preview-rows">{preview.items.map(item=>{const amount=item.inflow-item.outflow;return <div className="register-scheduled-preview-row" key={item.id}><time dateTime={item.nextDueDate}>{item.nextDueDate}</time><strong>{item.payee||"Scheduled transaction"}</strong><span>{item.category}</span><b className={amount>=0?"positive":"negative"}>{money.format(amount)}</b><div><button type="button" disabled={busyId!==null} onClick={()=>void act(item,"enter")}>Enter now</button><button type="button" disabled={busyId!==null} onClick={()=>void act(item,"skip")}>Skip</button></div></div>})}</div>
    {preview.remaining?<button className="register-scheduled-preview-more" type="button" onClick={onViewAll}>+{preview.remaining} more</button>:null}
    {error?<p className="register-scheduled-preview-error" role="alert">{error}</p>:null}
  </section>;
}
