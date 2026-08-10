import {
  createEntityRepository,
  createHybridTimestamp,
  createJsonReplicatedEntityCodec,
  createLwwRegister,
  type EntityRecordStorage,
  type ReplicatedEntity,
} from "../../../../../../packages/sync/src/browser.js";
import type { KeyValueStoragePort } from "../../persistence/keyValueStoragePort.js";
import type {
  BudgetSettingsPreference,
  GeneralSettingsPreference,
} from "../settingsPreferences.js";

export const SETTINGS_PREFERENCE_ENTITY_ID = "settings";
export const SETTINGS_PREFERENCE_ENTITY_INDEX_KEY = "budget-app.entity-replication.v1/settings-preference-index";
export const SETTINGS_PREFERENCE_ENTITY_RECORD_PREFIX = "budget-app.entity-replication.v1/settings-preference/";

export interface SettingsPreferenceEntityValue {
  id: string;
  general: GeneralSettingsPreference;
  budget: BudgetSettingsPreference;
}

function adapter(storage: KeyValueStoragePort): EntityRecordStorage {
  return { getItem:k=>storage.getItem(k), setItem:(k,v)=>storage.setItem(k,v), removeItem:k=>storage.removeItem(k), listKeys:()=>storage.listKeys?.()??[], flush:storage.flush?()=>storage.flush!():undefined };
}
function valid(fields: Readonly<Record<string, unknown>>): fields is SettingsPreferenceEntityValue & Readonly<Record<string, unknown>> {
  return fields.id === SETTINGS_PREFERENCE_ENTITY_ID && typeof fields.general === "object" && fields.general !== null && !Array.isArray(fields.general) && typeof fields.budget === "object" && fields.budget !== null && !Array.isArray(fields.budget);
}
export function createSettingsPreferenceEntityRepository(storage: KeyValueStoragePort) {
  const base=createEntityRepository<SettingsPreferenceEntityValue>({entityType:"settings-preference",storage:adapter(storage),codec:createJsonReplicatedEntityCodec<SettingsPreferenceEntityValue>(valid)});
  return { get:(id:string)=>base.get(id), save(entity:ReplicatedEntity<SettingsPreferenceEntityValue>){base.save(entity);storage.setItem(SETTINGS_PREFERENCE_ENTITY_INDEX_KEY,JSON.stringify([SETTINGS_PREFERENCE_ENTITY_ID]));} };
}
export function readSettingsPreferenceEntity(storage: KeyValueStoragePort): SettingsPreferenceEntityValue|null {
  const entity=createSettingsPreferenceEntityRepository(storage).get(SETTINGS_PREFERENCE_ENTITY_ID); if(!entity||entity.metadata.tombstone)return null;
  return {id:entity.fields.id.value,general:entity.fields.general.value,budget:entity.fields.budget.value};
}
export function writeSettingsPreferenceEntity(storage: KeyValueStoragePort, value: Omit<SettingsPreferenceEntityValue,"id">, now=new Date()): void {
  const repo=createSettingsPreferenceEntityRepository(storage), current=repo.get(SETTINGS_PREFERENCE_ENTITY_ID), ts=createHybridTimestamp(now.getTime(),0,"settings-preference-service");
  repo.save(Object.freeze({metadata:Object.freeze(current?{...current.metadata,tombstone:null}:{id:SETTINGS_PREFERENCE_ENTITY_ID,createdAt:ts,tombstone:null}),fields:Object.freeze({id:current?.fields.id??createLwwRegister(SETTINGS_PREFERENCE_ENTITY_ID,ts),general:current&&JSON.stringify(current.fields.general.value)===JSON.stringify(value.general)?current.fields.general:createLwwRegister(value.general,ts),budget:current&&JSON.stringify(current.fields.budget.value)===JSON.stringify(value.budget)?current.fields.budget:createLwwRegister(value.budget,ts)})}));
}
