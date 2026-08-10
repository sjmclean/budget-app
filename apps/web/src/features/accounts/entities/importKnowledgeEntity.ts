import {
  createEntityRepository,
  createHybridTimestamp,
  createJsonReplicatedEntityCodec,
  createLwwRegister,
  type EntityRecordStorage,
  type HybridTimestamp,
  type ReplicatedEntity,
} from "../../../../../../packages/sync/src/browser.js";
import type { KeyValueStoragePort } from "../../persistence/keyValueStoragePort.js";
import type { MerchantKnowledgeRecord } from "../merchantKnowledge.js";
import type { AccountImportKnowledge } from "../transactionImportKnowledge.js";

export const MERCHANT_KNOWLEDGE_ENTITY_INDEX_KEY = "budget-app.entity-replication.v1/merchant-knowledge-index";
export const MERCHANT_KNOWLEDGE_ENTITY_RECORD_PREFIX = "budget-app.entity-replication.v1/merchant-knowledge/";
export const ACCOUNT_IMPORT_KNOWLEDGE_ENTITY_INDEX_KEY = "budget-app.entity-replication.v1/account-import-knowledge-index";
export const ACCOUNT_IMPORT_KNOWLEDGE_ENTITY_RECORD_PREFIX = "budget-app.entity-replication.v1/account-import-knowledge/";

function adapter(storage: KeyValueStoragePort): EntityRecordStorage {
  return { getItem: (k) => storage.getItem(k), setItem: (k,v) => storage.setItem(k,v), removeItem: (k) => storage.removeItem(k), listKeys: () => storage.listKeys?.() ?? [], flush: storage.flush ? () => storage.flush!() : undefined };
}
function indexedRepository<T extends object>(storage: KeyValueStoragePort, entityType: string, indexKey: string, valid: (fields: Readonly<Record<string, unknown>>) => fields is T & Readonly<Record<string, unknown>>) {
  const base=createEntityRepository<T>({entityType,storage:adapter(storage),codec:createJsonReplicatedEntityCodec<T>(valid)});
  const read=():string[]=>{try{const p:unknown=JSON.parse(storage.getItem(indexKey)??"[]");return Array.isArray(p)?[...new Set(p.filter((x):x is string=>typeof x==="string"&&x.length>0))].sort():[]}catch{return[]}};
  const write=(ids:readonly string[])=>storage.setItem(indexKey,JSON.stringify([...new Set(ids)].sort()));
  return Object.freeze({get:(id:string)=>base.get(id),save(e:ReplicatedEntity<T>){base.save(e);write([...read(),e.metadata.id])},list(){return read().map(id=>base.get(id)).filter((e):e is ReplicatedEntity<T>=>e!==null&&e.metadata.tombstone===null)},purge(id:string){base.purge(id);write(read().filter(x=>x!==id))}});
}
const merchantValid=(f:Readonly<Record<string,unknown>>): f is MerchantKnowledgeRecord & Readonly<Record<string,unknown>> => typeof f.id==="string"&&typeof f.preferredName==="string"&&typeof f.normalisedName==="string"&&typeof f.occurrenceCount==="number"&&typeof f.firstSeenAt==="string"&&typeof f.lastSeenAt==="string"&&Array.isArray(f.aliases)&&Array.isArray(f.categoryUsage)&&Array.isArray(f.accountUsage)&&Array.isArray(f.transferUsage);
const accountValid=(f:Readonly<Record<string,unknown>>): f is AccountImportKnowledge & Readonly<Record<string,unknown>> => typeof f.accountId==="string"&&(f.fileType==="csv"||f.fileType==="qif")&&typeof f.structureSignature==="string"&&typeof f.successfulImportCount==="number"&&typeof f.firstUsedAt==="string"&&typeof f.lastUsedAt==="string";
export const createMerchantKnowledgeEntityRepository=(s:KeyValueStoragePort)=>indexedRepository(s,"merchant-knowledge",MERCHANT_KNOWLEDGE_ENTITY_INDEX_KEY,merchantValid);
export const createAccountImportKnowledgeEntityRepository=(s:KeyValueStoragePort)=>indexedRepository(s,"account-import-knowledge",ACCOUNT_IMPORT_KNOWLEDGE_ENTITY_INDEX_KEY,accountValid);
export const accountImportKnowledgeEntityId=(v:Pick<AccountImportKnowledge,"accountId"|"fileType"|"structureSignature">)=>JSON.stringify([v.accountId,v.fileType,v.structureSignature]);
export const importKnowledgeTimestamp=(d=new Date(),counter=0):HybridTimestamp=>createHybridTimestamp(d.getTime(),counter,"import-knowledge-service");
function project<T extends object>(e:ReplicatedEntity<T>):T{return Object.fromEntries(Object.entries(e.fields as Record<string, { readonly value: unknown }>).map(([k,r])=>[k,r.value])) as T}
function entity<T extends object>(id:string,fields:T,t:HybridTimestamp):ReplicatedEntity<T>{return Object.freeze({metadata:Object.freeze({id,createdAt:t,tombstone:null}),fields:Object.freeze(Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,createLwwRegister(v,t)]))) as ReplicatedEntity<T>["fields"]})}
function update<T extends object>(e:ReplicatedEntity<T>,fields:T,t:HybridTimestamp):ReplicatedEntity<T>{return Object.freeze({metadata:e.metadata,fields:Object.freeze(Object.fromEntries(Object.entries(fields).map(([k,v])=>{const c=e.fields[k as keyof T];return[k,JSON.stringify(c.value)===JSON.stringify(v)?c:createLwwRegister(v,t)]}))) as ReplicatedEntity<T>["fields"]})}
export function readMerchantKnowledgeEntities(s:KeyValueStoragePort):MerchantKnowledgeRecord[]{return createMerchantKnowledgeEntityRepository(s).list().map(project)}
export function replaceMerchantKnowledgeEntities(s:KeyValueStoragePort,records:readonly MerchantKnowledgeRecord[],now=new Date()):void{const r=createMerchantKnowledgeEntityRepository(s);const wanted=new Set(records.map(x=>x.id));for(const e of r.list())if(!wanted.has(e.metadata.id))r.purge(e.metadata.id);records.forEach((x,i)=>{const cur=r.get(x.id);r.save(cur?update(cur,x,importKnowledgeTimestamp(now,i)):entity(x.id,x,importKnowledgeTimestamp(now,i)))})}
export function findAccountImportKnowledgeEntity(s:KeyValueStoragePort,id:string):AccountImportKnowledge|undefined{const e=createAccountImportKnowledgeEntityRepository(s).get(id);return e?project(e):undefined}
export function upsertAccountImportKnowledgeEntity(s:KeyValueStoragePort,value:AccountImportKnowledge,now=new Date()):AccountImportKnowledge{const r=createAccountImportKnowledgeEntityRepository(s);const id=accountImportKnowledgeEntityId(value);const cur=r.get(id);const next=cur?update(cur,value,importKnowledgeTimestamp(now)):entity(id,value,importKnowledgeTimestamp(now));r.save(next);return project(next)}
