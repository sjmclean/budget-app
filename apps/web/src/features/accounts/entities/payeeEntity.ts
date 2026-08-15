import {
  createEntityRepository, createHybridTimestamp, createJsonReplicatedEntityCodec,
  createLwwRegister, compareHybridTimestamps, mergeLwwRegisters,
  type EntityRecordStorage, type HybridTimestamp, type ReplicatedEntity,
} from "../../../../../../packages/sync/src/browser.js";
import type { KeyValueStoragePort } from "../../persistence/keyValueStoragePort.js";
import type { PayeeImportRuleView, PayeeView } from "../payeeService.js";

export const PAYEE_ENTITY_INDEX_KEY = "budget-app.entity-replication.v1/payee-index";
export const PAYEE_ENTITY_RECORD_PREFIX = "budget-app.entity-replication.v1/payee/";
export type PayeeEntityFields = Omit<Required<PayeeView>, "id">;
const validFields = (f: Readonly<Record<string, unknown>>): f is PayeeEntityFields =>
  typeof f.name === "string" && typeof f.createdAt === "string" && typeof f.lastUsedAt === "string" &&
  typeof f.useCount === "number" && Number.isFinite(f.useCount) && typeof f.note === "string" &&
  typeof f.defaultCategoryId === "string" && typeof f.defaultCategoryName === "string" &&
  Array.isArray(f.importRules) && typeof f.isArchived === "boolean";

export function createPayeeEntityRepository(storage: KeyValueStoragePort) {
  const adapter: EntityRecordStorage = { getItem:k=>storage.getItem(k), setItem:(k,v)=>storage.setItem(k,v), removeItem:k=>storage.removeItem(k), listKeys:()=>storage.listKeys?.()??[], flush:storage.flush?()=>storage.flush!():undefined };
  const base=createEntityRepository<PayeeEntityFields>({entityType:"payee",storage:adapter,codec:createJsonReplicatedEntityCodec(validFields)});
  const readIds=():string[]=>{try{const p=JSON.parse(storage.getItem(PAYEE_ENTITY_INDEX_KEY)??"[]");return Array.isArray(p)?p.filter((x):x is string=>typeof x==="string").sort():[]}catch{return[]}};
  const writeIds=(ids:string[])=>storage.setItem(PAYEE_ENTITY_INDEX_KEY,JSON.stringify([...new Set(ids)].sort()));
  return Object.freeze({
    get:(id:string)=>base.get(id), has:(id:string)=>base.has(id),
    save(e:ReplicatedEntity<PayeeEntityFields>){base.save(e);writeIds([...readIds(),e.metadata.id])},
    list(options:{includeTombstoned?:boolean}={}){return readIds().map(id=>base.get(id)).filter((e):e is ReplicatedEntity<PayeeEntityFields>=>e!==null).filter(e=>options.includeTombstoned||e.metadata.tombstone===null)},
    purge(id:string){base.purge(id);writeIds(readIds().filter(x=>x!==id))}, flush:()=>base.flush(),
  });
}
export const payeeTimestampFor=(now:Date,counter=0):HybridTimestamp=>createHybridTimestamp(now.getTime(),counter,"payee-service");
export function createPayeeEntity(p:PayeeView,t:HybridTimestamp):ReplicatedEntity<PayeeEntityFields>{const fields:PayeeEntityFields={name:p.name,createdAt:p.createdAt,lastUsedAt:p.lastUsedAt,useCount:p.useCount,note:p.note??"",defaultCategoryId:p.defaultCategoryId??"",defaultCategoryName:p.defaultCategoryName??"",importRules:p.importRules??[],aliases:p.aliases??[],scheduledUseCount:p.scheduledUseCount??0,iconRef:p.iconRef??"",isArchived:p.isArchived===true};return Object.freeze({metadata:Object.freeze({id:p.id,createdAt:t,tombstone:null}),fields:Object.freeze(Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,createLwwRegister(v,t)])) as any)})}
export function projectPayee(e:ReplicatedEntity<PayeeEntityFields>):PayeeView{const f=e.fields as typeof e.fields & Record<string,any>;return{id:e.metadata.id,name:f.name.value,createdAt:f.createdAt.value,lastUsedAt:f.lastUsedAt.value,useCount:f.useCount.value,note:f.note.value,defaultCategoryId:f.defaultCategoryId.value,defaultCategoryName:f.defaultCategoryName.value,importRules:f.importRules.value as PayeeImportRuleView[],aliases:f.aliases?.value??[],scheduledUseCount:f.scheduledUseCount?.value??0,iconRef:f.iconRef?.value??"",isArchived:f.isArchived.value}}
export function mergePayeeEntities(a:ReplicatedEntity<PayeeEntityFields>,b:ReplicatedEntity<PayeeEntityFields>):ReplicatedEntity<PayeeEntityFields>{if(a.metadata.id!==b.metadata.id)throw new TypeError("Cannot merge different payees.");const tombstone=!a.metadata.tombstone?b.metadata.tombstone:!b.metadata.tombstone?a.metadata.tombstone:compareHybridTimestamps(a.metadata.tombstone,b.metadata.tombstone)>=0?a.metadata.tombstone:b.metadata.tombstone;const fields:any={};for(const key of new Set([...Object.keys(a.fields),...Object.keys(b.fields)])){const left=(a.fields as any)[key];const right=(b.fields as any)[key];fields[key]=left&&right?mergeLwwRegisters(left,right):left??right}return Object.freeze({metadata:Object.freeze({...a.metadata,tombstone}),fields:Object.freeze(fields)})}
export function replacePayeeEntities(storage:KeyValueStoragePort,payees:readonly PayeeView[],now=new Date()):void{const repo=createPayeeEntityRepository(storage);for(const e of repo.list({includeTombstoned:true}))repo.purge(e.metadata.id);payees.forEach((p,i)=>repo.save(createPayeeEntity(p,payeeTimestampFor(now,i))))}
