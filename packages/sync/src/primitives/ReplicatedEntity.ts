import type { HybridTimestamp } from "./HybridTimestamp.js";
import type { LwwRegister } from "./LwwRegister.js";
import type { Tombstone } from "./Tombstone.js";

export type ReplicatedEntityMetadata = Readonly<{
  id: string;
  createdAt: HybridTimestamp;
  tombstone: Tombstone;
}>;

export type ReplicatedFields<T extends object> = {
  readonly [K in keyof T]: LwwRegister<T[K]>;
};

export type ReplicatedEntity<T extends object> = Readonly<{
  metadata: ReplicatedEntityMetadata;
  fields: ReplicatedFields<T>;
}>;
